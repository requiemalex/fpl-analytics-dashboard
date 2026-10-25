/**
 * Fits Scoutline's Model Predicted points model (client/src/metrics/
 * pointsModel.ts) and writes its settings to
 * client/src/metrics/pointsModelParams.generated.ts.
 *
 * <fit_on_the_past_only>: every setting is fitted on 2022/23–2024/25 only
 * (TRAIN_SEASONS), from samples built as of each gameweek (history.ts
 * <as_of_evidence>); 2025/26 and 2026/27 are left for the backtest to prove
 * it on. The one exception is defensive contribution, which FPL only
 * recorded from 2025/26: its settings are fitted on 2025/26 gameweeks 1–19,
 * and the backtest reports gameweeks 20–38 and 2026/27 apart, as the clean
 * test for it.
 *
 * Each part is fitted against its own outcome, with his ACTUAL minutes in
 * the match, so a part's settings aren't bent to make up for playing-time
 * errors: goals against goals scored, saves against saves, and so on;
 * playing time against starts and minutes.
 *
 * Run from the repo root: npx tsx client/scripts/pointsModel/fit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSamples, POSITIONS, ROOT, type Sample } from "./history";
import { chanceAtLeast, playerRates, startFeatures, startMinutes, type ModelParams, type PositionParams, type StartFeatures, type StartModel } from "../../src/metrics/pointsModel";
import type { Position } from "../../src/types/normalized";

const TRAIN_SEASONS = new Set(["2022/23", "2023/24", "2024/25"]);
const DC_SEASON = "2025/26";
const DC_LAST_ROUND = 19;
/** Measured from Understat's shots, 2022/23–2025/26 (README): penalties per club per match, the share scored, and FPL's xG for one (its only-shot-was-a-penalty matches: 0.79 every time). */
const PENALTY = { perClubMatch: 0.1253, conversion: 0.829, xG: 0.79 };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---------- optimisers ----------

/** Golden-section search for the minimum of f on [lo, hi]. */
function golden(f: (x: number) => number, lo: number, hi: number, iters = 28): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

interface Knob {
  name: string;
  lo: number;
  hi: number;
  get: () => number;
  set: (v: number) => void;
}

/** Coordinate descent: each knob in turn to its best value, `sweeps` times over. */
function coordinateDescent(knobs: Knob[], loss: () => number, sweeps = 3): number {
  for (let s = 0; s < sweeps; s++) {
    for (const k of knobs) {
      const best = golden((v) => {
        k.set(v);
        return loss();
      }, k.lo, k.hi);
      k.set(best);
    }
  }
  return loss();
}

/** Logistic regression by Newton's method (a touch of ridge for stability). */
function logisticFit(X: number[][], y: number[], ridge = 1e-3, iters = 25): number[] {
  const p = X[0].length;
  let w = new Array(p).fill(0);
  for (let it = 0; it < iters; it++) {
    const grad = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, x, j) => s + x * w[j], 0);
      const mu = 1 / (1 + Math.exp(-z));
      const r = mu * (1 - mu);
      for (let j = 0; j < p; j++) {
        grad[j] += (mu - y[i]) * X[i][j];
        for (let k = 0; k < p; k++) H[j][k] += r * X[i][j] * X[i][k];
      }
    }
    for (let j = 0; j < p; j++) {
      grad[j] += ridge * w[j];
      H[j][j] += ridge;
    }
    w = w.map((wj, j) => wj - solve(H, grad)[j]);
  }
  return w;
}

/** Gaussian elimination: H x = g. */
function solve(H: number[][], g: number[]): number[] {
  const n = g.length;
  const A = H.map((row, i) => [...row, g[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/** Poisson deviance (up to a constant): how badly means `mu` explain counts `y`. */
const poissonLoss = (mu: number, y: number) => {
  const m = Math.max(mu, 1e-9);
  return m - y * Math.log(m);
};
const logLoss = (p: number, y: boolean) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));

// ---------- start-feature design matrix ----------

/** [intercept, price, last started, recent share, season share, no matches, last season share, no last season, first back, second back, sell-off, sell-off × recent share] */
function startRow(f: StartFeatures): number[] {
  const has = f.hasMatches ? 1 : 0;
  const hasLs = f.lastSeasonShare === null ? 0 : 1;
  return [
    1, f.price, has * f.lastStarted, has * f.recentShare, has * f.seasonShare, 1 - has, hasLs * (f.lastSeasonShare ?? 0), 1 - hasLs,
    f.returnFirst, f.returnSecond, f.sellOff, f.sellOff * f.recentShare,
  ];
}
function toStartModel(w: number[]): StartModel {
  return {
    intercept: w[0], price: w[1], lastStarted: w[2], recentShare: w[3], seasonShare: w[4], noMatches: w[5], lastSeasonShare: w[6], noLastSeason: w[7],
    returnFirst: w[8], returnSecond: w[9], sellOff: w[10], sellOffByRecent: w[11],
  };
}

// ---------- main ----------

function defaultPosition(): PositionParams {
  return {
    start: { intercept: 0, lastStarted: 0, recentShare: 0, seasonShare: 0, lastSeasonShare: 0, noMatches: 0, noLastSeason: 0, price: 0, returnFirst: 0, returnSecond: 0, sellOff: 0, sellOffByRecent: 0 },
    sixtyGivenStart: 0.9,
    minutesLongStart: 85,
    minutesShortStart: 45,
    subRate: 0.2,
    minutesSub: 25,
    goalPrior: { base: 0.1, perPrice: 0 },
    assistPrior: { base: 0.1, perPrice: 0 },
    bonusPrior: { base: 0.2, perPrice: 0 },
    savesPrior: 0,
    dcPrior: 5,
    yellowPrior: 0.1,
    redPer90: 0,
    ownGoalPer90: 0,
    penaltySavePer90: 0,
    bonusWin: 0,
    dcDispersion: 1,
  };
}

async function main() {
  console.log("Building samples (as of each gameweek)...");
  const { samples } = await buildSamples();
  const train = samples.filter((s) => TRAIN_SEASONS.has(s.season));
  const played = train.filter((s) => s.actual.minutes > 0);
  console.log(`Training samples: ${train.length} (${played.length} with minutes)`);

  const params: ModelParams = {
    byPosition: { GKP: defaultPosition(), DEF: defaultPosition(), MID: defaultPosition(), FWD: defaultPosition() },
    goalXgWeight: 0.5,
    assistXaWeight: 0.5,
    seasonDecay: 0.5,
    goalShrink: 5,
    assistShrink: 5,
    bonusShrink: 5,
    savesShrink: 5,
    dcShrink: 3,
    yellowShrink: 10,
    subShrink: 5,
    startMinutesShrink: 5,
    attackExponent: 1,
    savesExponent: 1,
    concedeScale: 1,
    penalty: PENALTY,
  };
  const report: Record<string, unknown> = { trainSeasons: [...TRAIN_SEASONS], trainSamples: train.length };
  const byPos = (pos: Position, rows: Sample[]) => rows.filter((s) => s.position === pos);

  // 1. Playing time: how long starters and subs play, by position (empirical).
  for (const pos of POSITIONS) {
    const pp = params.byPosition[pos];
    const rows = byPos(pos, train);
    const starts = rows.filter((s) => s.actual.started);
    const long = starts.filter((s) => s.actual.minutes >= 60);
    const short = starts.filter((s) => s.actual.minutes < 60);
    const notStarted = rows.filter((s) => !s.actual.started);
    const subs = notStarted.filter((s) => s.actual.minutes > 0);
    pp.sixtyGivenStart = long.length / starts.length;
    pp.minutesLongStart = mean(long.map((s) => s.actual.minutes));
    pp.minutesShortStart = mean(short.map((s) => s.actual.minutes));
    pp.subRate = subs.length / notStarted.length;
    pp.minutesSub = mean(subs.map((s) => s.actual.minutes));
    // Rare events per 90, by position.
    const mins = rows.reduce((a, s) => a + s.actual.minutes, 0) / 90;
    const withCards = rows.filter((s) => s.actual.red !== null);
    const cardMins = withCards.reduce((a, s) => a + s.actual.minutes, 0) / 90;
    pp.redPer90 = withCards.reduce((a, s) => a + (s.actual.red ?? 0), 0) / cardMins;
    pp.ownGoalPer90 = rows.reduce((a, s) => a + s.actual.ownGoals, 0) / mins;
    pp.penaltySavePer90 = pos === "GKP" ? withCards.reduce((a, s) => a + (s.actual.penaltiesSaved ?? 0), 0) / cardMins : 0;
  }

  // 2. Chance of starting: a logistic per position, on what was known before each match.
  for (const pos of POSITIONS) {
    const rows = byPos(pos, train);
    const X = rows.map((s) => startRow(startFeatures(s.evidence)));
    const y = rows.map((s) => (s.actual.started ? 1 : 0));
    params.byPosition[pos].start = toStartModel(logisticFit(X, y));
    console.log(`  ${pos} start model:`, params.byPosition[pos].start);
  }

  // 3. How often a non-starter comes on: his own record, pulled toward his position's rate.
  {
    const rows = train.filter((s) => !s.actual.started);
    params.subShrink = golden((k) => {
      let l = 0;
      for (const s of rows) {
        const ns = s.evidence.matches.filter((m) => !m.started);
        const on = ns.filter((m) => m.minutes > 0).length;
        l += logLoss((on + k * params.byPosition[s.position].subRate) / (ns.length + k), s.actual.minutes > 0);
      }
      return l;
    }, 0.1, 40);
  }

  // 3b. How long he plays when he starts: his own starts, pulled toward his position's (a Gaussian fit on minutes, starts only).
  {
    const rows = train.filter((s) => s.actual.started);
    params.startMinutesShrink = golden((k) => {
      params.startMinutesShrink = k;
      let l = 0;
      for (const s of rows) {
        const pp = params.byPosition[s.position];
        const { sixtyShare, longMinutes } = startMinutes(s.evidence, pp, params);
        const expected = sixtyShare * longMinutes + (1 - sixtyShare) * pp.minutesShortStart;
        l += (expected - s.actual.minutes) ** 2;
      }
      return l;
    }, 0.2, 40);
    report.startMinutesShrink = params.startMinutesShrink;
  }

  // 4. Goals conceded: the forecast's goals against, scaled, against clean sheets of everyone who played 60+.
  {
    const rows = played.filter((s) => s.actual.minutes >= 60);
    params.concedeScale = golden((k) => rows.reduce((l, s) => l + logLoss(Math.exp(-(k * s.outlook.goalsAgainst * s.actual.minutes) / 90), s.actual.cleanSheet), 0), 0.5, 1.5);
  }

  // A sample of rows that played, for the rate fits (every 2nd: plenty, and quicker).
  const rateRows = played.filter((_, i) => i % 2 === 0);
  const attackOf = (s: Sample) => Math.pow(s.outlook.goalsFor / s.outlook.baseFor, params.attackExponent);

  // 5. Goals: blend, decay, shrink, attack scaling and the price priors.
  const priorKnobs = (key: "goalPrior" | "assistPrior" | "bonusPrior", lo: number, hi: number, slopeLo: number, slopeHi: number): Knob[] =>
    POSITIONS.flatMap((pos) => [
      { name: `${pos}.${key}.base`, lo, hi, get: () => params.byPosition[pos][key].base, set: (v) => (params.byPosition[pos][key].base = v) },
      { name: `${pos}.${key}.perPrice`, lo: slopeLo, hi: slopeHi, get: () => params.byPosition[pos][key].perPrice, set: (v) => (params.byPosition[pos][key].perPrice = v) },
    ]);
  const goalLoss = () => rateRows.reduce((l, s) => l + poissonLoss(playerRates(s.evidence, params).goals * attackOf(s) * (s.actual.minutes / 90), s.actual.goals), 0);
  report.goalLoss = coordinateDescent(
    [
      { name: "goalXgWeight", lo: 0, hi: 1, get: () => params.goalXgWeight, set: (v) => (params.goalXgWeight = v) },
      { name: "seasonDecay", lo: 0.05, hi: 1, get: () => params.seasonDecay, set: (v) => (params.seasonDecay = v) },
      { name: "goalShrink", lo: 0.5, hi: 40, get: () => params.goalShrink, set: (v) => (params.goalShrink = v) },
      { name: "attackExponent", lo: 0, hi: 2, get: () => params.attackExponent, set: (v) => (params.attackExponent = v) },
      ...priorKnobs("goalPrior", -0.5, 0.5, -0.05, 0.1),
    ],
    goalLoss,
  );
  console.log("  goals:", { α: params.goalXgWeight, decay: params.seasonDecay, shrink: params.goalShrink, attack: params.attackExponent });

  // 6. Assists (decay and attack scaling shared with goals).
  const assistLoss = () => rateRows.reduce((l, s) => l + poissonLoss(playerRates(s.evidence, params).assists * attackOf(s) * (s.actual.minutes / 90), s.actual.assists), 0);
  report.assistLoss = coordinateDescent(
    [
      { name: "assistXaWeight", lo: 0, hi: 1, get: () => params.assistXaWeight, set: (v) => (params.assistXaWeight = v) },
      { name: "assistShrink", lo: 0.5, hi: 40, get: () => params.assistShrink, set: (v) => (params.assistShrink = v) },
      ...priorKnobs("assistPrior", -0.5, 0.5, -0.05, 0.1),
    ],
    assistLoss,
  );
  console.log("  assists:", { α: params.assistXaWeight, shrink: params.assistShrink });

  // 7. Bonus: rate, prior, and how much it follows the chance of winning.
  const bonusLoss = () =>
    rateRows.reduce((l, s) => {
      const pp = params.byPosition[s.position];
      return l + poissonLoss(playerRates(s.evidence, params).bonus * (s.actual.minutes / 90) * Math.max(0, 1 + pp.bonusWin * (s.outlook.win - s.outlook.baseWin)), s.actual.bonus);
    }, 0);
  report.bonusLoss = coordinateDescent(
    [
      { name: "bonusShrink", lo: 0.5, hi: 40, get: () => params.bonusShrink, set: (v) => (params.bonusShrink = v) },
      ...priorKnobs("bonusPrior", -1, 1, -0.1, 0.2),
      ...POSITIONS.map((pos): Knob => ({ name: `${pos}.bonusWin`, lo: 0, hi: 4, get: () => params.byPosition[pos].bonusWin, set: (v) => (params.byPosition[pos].bonusWin = v) })),
    ],
    bonusLoss,
  );

  // 8. Saves (goalkeepers): rate, prior and how much they follow the opponent's expected goals.
  {
    const gk = rateRows.filter((s) => s.position === "GKP");
    params.byPosition.GKP.savesPrior = (gk.reduce((a, s) => a + s.actual.saves, 0) / gk.reduce((a, s) => a + s.actual.minutes, 0)) * 90;
    const loss = () =>
      gk.reduce((l, s) => l + poissonLoss(playerRates(s.evidence, params).saves * Math.pow(s.outlook.goalsAgainst / s.outlook.baseAgainst, params.savesExponent) * (s.actual.minutes / 90), s.actual.saves), 0);
    report.savesLoss = coordinateDescent(
      [
        { name: "savesShrink", lo: 0.5, hi: 60, get: () => params.savesShrink, set: (v) => (params.savesShrink = v) },
        { name: "savesExponent", lo: 0, hi: 2, get: () => params.savesExponent, set: (v) => (params.savesExponent = v) },
        { name: "GKP.savesPrior", lo: 0.5, hi: 6, get: () => params.byPosition.GKP.savesPrior, set: (v) => (params.byPosition.GKP.savesPrior = v) },
      ],
      loss,
    );
  }

  // 9. Yellow cards.
  {
    const rows = rateRows.filter((s) => s.actual.yellow !== null);
    for (const pos of POSITIONS) {
      const r = rows.filter((s) => s.position === pos);
      params.byPosition[pos].yellowPrior = (r.reduce((a, s) => a + (s.actual.yellow ?? 0), 0) / r.reduce((a, s) => a + s.actual.minutes, 0)) * 90;
    }
    params.yellowShrink = golden((k) => {
      params.yellowShrink = k;
      return rows.reduce((l, s) => l + poissonLoss(playerRates(s.evidence, params).yellow * (s.actual.minutes / 90), s.actual.yellow ?? 0), 0);
    }, 0.5, 60);
  }

  // 10. Defensive contribution: only 2025/26 has it, so gameweeks 1–19 of it (see <fit_on_the_past_only>).
  {
    const rows = samples.filter((s) => s.season === DC_SEASON && s.round <= DC_LAST_ROUND && s.actual.minutes > 0 && s.actual.dc !== null && s.position !== "GKP");
    for (const pos of ["DEF", "MID", "FWD"] as Position[]) {
      const r = rows.filter((s) => s.position === pos);
      params.byPosition[pos].dcPrior = (r.reduce((a, s) => a + (s.actual.dc ?? 0), 0) / r.reduce((a, s) => a + s.actual.minutes, 0)) * 90;
    }
    const thr: Record<Position, number> = { GKP: 0, DEF: 10, MID: 12, FWD: 12 };
    const loss = () =>
      rows.reduce((l, s) => {
        const pp = params.byPosition[s.position];
        const p = chanceAtLeast(thr[s.position], (playerRates(s.evidence, params).dc * s.actual.minutes) / 90, pp.dcDispersion);
        return l + logLoss(p, (s.actual.dc ?? 0) >= thr[s.position]);
      }, 0);
    report.dcLoss = coordinateDescent(
      [
        { name: "dcShrink", lo: 0.2, hi: 30, get: () => params.dcShrink, set: (v) => (params.dcShrink = v) },
        ...(["DEF", "MID", "FWD"] as Position[]).map((pos): Knob => ({ name: `${pos}.dcDispersion`, lo: 1, hi: 3, get: () => params.byPosition[pos].dcDispersion, set: (v) => (params.byPosition[pos].dcDispersion = v) })),
      ],
      loss,
      2,
    );
    report.dcRows = rows.length;
  }

  // Round for readability; written as the app's settings.
  const round = (x: unknown): unknown =>
    typeof x === "number" ? Number(x.toPrecision(4)) : Array.isArray(x) ? x.map(round) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)])) : x;
  const rounded = round(params) as ModelParams;
  const out = path.join(ROOT, "client/src/metrics/pointsModelParams.generated.ts");
  fs.writeFileSync(
    out,
    `// Written by client/scripts/pointsModel/fit.ts (npx tsx client/scripts/pointsModel/fit.ts) — don't edit by hand.\n` +
      `// Fitted on ${[...TRAIN_SEASONS].join(", ")} (defensive contribution: ${DC_SEASON} GW1–${DC_LAST_ROUND}); README "Team Building — Model Predicted".\n` +
      `import type { ModelParams } from "./pointsModel";\n\n` +
      `export const MODEL_PARAMS: ModelParams = ${JSON.stringify(rounded, null, 2)};\n`,
  );
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fit-report.json"), JSON.stringify(round(report), null, 2));
  console.log(`Wrote ${out}`);
  for (const pos of POSITIONS) console.log(pos, JSON.stringify(rounded.byPosition[pos]));
  console.log(JSON.stringify({ ...rounded, byPosition: undefined }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
