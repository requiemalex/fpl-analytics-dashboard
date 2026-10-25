/**
 * Proves Scoutline's Model Predicted points model on seasons it wasn't
 * fitted on, against the model it replaced and a simple baseline, and
 * writes the results to docs/models/model-predicted-backtest.md (and
 * backtest-results.json beside this script, for the summary page).
 *
 * Every prediction is made as of before its gameweek (history.ts
 * <as_of_evidence>) and scored against what the player actually scored.
 * Test sets (fit.ts <fit_on_the_past_only>):
 *  - 2025/26, every gameweek: unseen by every setting except defensive
 *    contribution's (fitted on its GW1–19);
 *  - 2025/26 GW20–38 and 2026/27 so far: unseen by every setting.
 *
 * Neither the new nor the old model is told about injuries or suspensions
 * here: FPL's availability news is only on record from 2026/27 GW9
 * (<availability_record>), and history.ts reads it where it is. In the app
 * both scale by FPL's chance of playing, which only helps them. The new
 * model does see the team news managers act on before each deadline: their
 * net selling of him (<transfer_signal>), as in the app.
 *
 * Run from the repo root: npx tsx client/scripts/pointsModel/backtest.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSamples, POSITIONS, ROOT, rulesForSeason, type Sample } from "./history";
import { computeExpectedPointsV2ForFixture } from "./legacyModel";
import { predictMatch, type ModelBreakdown, type ModelParams } from "../../src/metrics/pointsModel";
import { MODEL_PARAMS } from "../../src/metrics/pointsModelParams.generated";
import { computeBlendedMinutesReliability } from "../../src/metrics/minutesReliabilityBlend";
import { buildHistoricPlayerProfile } from "../../src/metrics/historicAnalysis";
import type { NormalizedPlayer, NormalizedTeam, PlayerSeasonHistory, Position } from "../../src/types/normalized";
import type { UpcomingFixture } from "../../src/metrics/fixtureTicker";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Row {
  s: Sample;
  actual: number;
  preds: Record<string, number | null>;
  model: ModelBreakdown;
}

const MODELS = ["new", "newUnderstat", "old", "baseline"] as const;
const LABEL: Record<string, string> = {
  new: "New model (FPL data)",
  newUnderstat: "New model + Understat penalties",
  old: "Replaced model",
  baseline: "Points per match so far",
  newNoFixture: "New model, every fixture average",
};

// ---------- the replaced model, fed as the app fed it ----------

function legacyPrediction(s: Sample): number | null {
  const l = s.legacy;
  const player = {
    id: s.code,
    position: s.position,
    minutes: l.totals.minutes,
    xG: l.totals.xG,
    xA: l.totals.xA,
    xGC: l.totals.xGC,
    saves: l.totals.saves,
    defensiveContributions: l.totals.dc,
    status: "a",
    chanceOfPlayingNextRound: null,
  } as unknown as NormalizedPlayer;
  const team = { played: l.clubPlayed, strengthOverallHome: l.ownStrength, strengthOverallAway: l.ownStrength } as unknown as NormalizedTeam;
  const opp = { strengthOverallHome: l.opponentStrength, strengthOverallAway: l.opponentStrength } as unknown as NormalizedTeam;
  const seasons = l.past.map(
    (p) =>
      ({ seasonName: p.season, minutes: p.minutes, starts: p.starts, bonus: p.bonus, bps: p.bps, totalPoints: p.totalPoints, goals: 0, assists: 0, cleanSheets: 0, goalsConceded: null, ictIndex: null, startCost: null, endCost: null, xG: null, xA: null, xGI: null, xGC: null, defensiveContribution: null, saves: null, penaltiesSaved: null, yellowCards: null, redCards: null, influence: null, creativity: null, threat: null, tackles: null, clearancesBlocksInterceptions: null, recoveries: null }) as PlayerSeasonHistory,
  );
  const reference = l.past.length ? l.past[l.past.length - 1].season : null;
  // The app's reference season is the last completed one, whoever played in it.
  const lastCompleted = `${Number(s.season.slice(0, 4)) - 1}/${s.season.slice(2, 4)}`;
  const profile = buildHistoricPlayerProfile(seasons, reference === null ? null : lastCompleted);
  const reliability = computeBlendedMinutesReliability(player, team, profile).value;
  if (reliability === null) return null;
  const fixture = { fixtureId: 0, opponentTeamId: 0, opponentShortName: "", isHome: s.home, difficulty: l.difficulty ?? 3 } as UpcomingFixture;
  return computeExpectedPointsV2ForFixture(player, fixture, team, opp, reliability, profile).total;
}

// ---------- scoring ----------

/** What each part actually paid in the match, under that season's rules (cards null where not on record). */
function actualParts(s: Sample): Record<string, number | null> {
  const a = s.actual;
  const r = rulesForSeason(s.season);
  const thr = r.defensiveContributionThreshold[s.position];
  return {
    appearance: a.minutes >= 60 ? 2 : a.minutes > 0 ? 1 : 0,
    goals: a.goals * r.goal[s.position],
    assists: a.assists * r.assist,
    cleanSheet: a.minutes >= 60 && a.cleanSheet ? r.cleanSheet[s.position] : 0,
    goalsConceded: Math.floor(a.goalsConceded / 2) * r.goalsConcededPer2[s.position],
    saves: s.position === "GKP" ? Math.floor(a.saves / 3) * r.savesPer3 + (a.penaltiesSaved ?? 0) * r.penaltySave : 0,
    defensiveContribution: thr !== null && r.defensiveContribution > 0 && a.dc !== null ? (a.dc >= thr ? r.defensiveContribution : 0) : 0,
    bonus: a.bonus,
    cards: a.yellow === null ? null : a.yellow * r.yellowCard + (a.red ?? 0) * r.redCard + a.ownGoals * r.ownGoal + (a.penaltiesMissed ?? 0) * r.penaltyMiss,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function spearman(a: number[], b: number[]): number {
  const rank = (x: number[]) => {
    const order = x.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array(x.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

interface Metrics {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  /** Pearson correlation of predicted and actual points among players of one position in one gameweek, averaged. */
  corr: number;
  /** The same by rank (Spearman): see <rank_ties> for why it isn't the headline. */
  rankCorr: number;
  /** Average actual points of the 5 highest predictions per position per gameweek. */
  top5: number;
  top10: number;
  captain: number;
}

function pearson(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

function metrics(rows: Row[], key: string): Metrics {
  const rs = rows.filter((r) => r.preds[key] !== null);
  const err = rs.map((r) => r.preds[key]! - r.actual);
  const corrs: number[] = [];
  const pearsons: number[] = [];
  const top5: number[] = [];
  const top10: number[] = [];
  const captain: number[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of rs) {
    const k = `${r.s.season}:${r.s.round}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) {
    for (const pos of POSITIONS) {
      const p = g.filter((r) => r.s.position === pos);
      if (p.length > 10) {
        corrs.push(spearman(p.map((r) => r.preds[key]!), p.map((r) => r.actual)));
        pearsons.push(pearson(p.map((r) => r.preds[key]!), p.map((r) => r.actual)));
        top5.push(mean([...p].sort((a, b) => b.preds[key]! - a.preds[key]!).slice(0, 5).map((r) => r.actual)));
      }
    }
    // A double gameweek's two matches count as two picks; fine for comparing models on the same rows.
    const sorted = [...g].sort((a, b) => b.preds[key]! - a.preds[key]!);
    top10.push(mean(sorted.slice(0, 10).map((r) => r.actual)));
    captain.push(sorted[0].actual);
  }
  return {
    n: rs.length,
    mae: mean(err.map(Math.abs)),
    rmse: Math.sqrt(mean(err.map((e) => e * e))),
    bias: mean(err),
    corr: mean(pearsons.filter((c) => !Number.isNaN(c))),
    rankCorr: mean(corrs.filter((c) => !Number.isNaN(c))),
    top5: mean(top5),
    top10: mean(top10),
    captain: mean(captain),
  };
}

const f2 = (x: number) => (Number.isNaN(x) ? "—" : x.toFixed(2));
const f3 = (x: number) => (Number.isNaN(x) ? "—" : x.toFixed(3));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

async function main() {
  console.log("Building samples...");
  const { samples } = await buildSamples();
  const testSamples = samples.filter((s) => s.season >= "2025/26");
  const noFixture: ModelParams = MODEL_PARAMS;

  console.log(`Predicting ${testSamples.length} matches...`);
  const rows: Row[] = testSamples.map((s) => {
    const rules = rulesForSeason(s.season);
    const model = predictMatch(s.evidence, s.outlook, MODEL_PARAMS, rules);
    const withPens = predictMatch(s.evidenceWithPenalties ?? s.evidence, s.outlook, MODEL_PARAMS, rules);
    const flat = { ...s.outlook, goalsFor: s.outlook.baseFor, goalsAgainst: s.outlook.baseAgainst, win: s.outlook.baseWin };
    const t = s.legacy.totals;
    const baseline = t.matches > 0 ? t.points / t.matches : s.legacy.past.length ? s.legacy.past[s.legacy.past.length - 1].totalPoints / 38 : 0;
    return {
      s,
      actual: s.actual.points,
      model,
      preds: { new: model.total, newUnderstat: withPens.total, old: legacyPrediction(s), baseline, newNoFixture: predictMatch(s.evidence, flat, noFixture, rules).total },
    };
  });

  const sets: { name: string; note: string; rows: Row[] }[] = [
    { name: "2025/26, GW1–38", note: "every setting unseen except defensive contribution's (fitted on GW1–19)", rows: rows.filter((r) => r.s.season === "2025/26") },
    { name: "2025/26, GW20–38", note: "fully unseen", rows: rows.filter((r) => r.s.season === "2025/26" && r.s.round >= 20) },
    { name: "2026/27 so far", note: "fully unseen, the live season", rows: rows.filter((r) => r.s.season === "2026/27") },
  ];

  const out: string[] = [];
  const json: Record<string, unknown> = { generatedAt: new Date().toISOString(), sets: [] as unknown[] };
  out.push("# Model Predicted — backtest");
  out.push("");
  out.push("Written by `client/scripts/pointsModel/backtest.ts` — don't edit by hand; re-run it after refitting (`fit.ts`). How the model works and what each setting means: README \"Team Building — Model Predicted\".");
  out.push("");
  out.push(`Every prediction is made as of before its gameweek, from what the app would have known then, and scored against the points actually scored. Neither model is told about injuries here (FPL's availability news is only on record from 2026/27 GW9); the new model does see managers' net selling of each player before the deadline, as it does in the app. RMSE and MAE: the typical miss in points (RMSE weighs big misses more). MAE favours a figure pulled toward 0: about half of all players in a gameweek score exactly 0, so an under-predicting model (the replaced one's bias is negative) gets the smaller average absolute miss without being a better expected-points figure; RMSE and bias judge an expectation fairly. Bias: the average miss (+ over-predicts). Correlation: between predicted and actual points among players of the same position in the same gameweek, averaged (how well it orders them). Top 5 per position, Top 10 and Captain: the average actual points of the model's 5 highest predictions in each position, 10 highest overall, and single highest, each gameweek.`);
  out.push("");
  out.push(`<rank_ties>: "Rank (ties)" is the same correlation by rank. It's shown, but isn't the headline, because about half the players in a gameweek don't play and all score exactly 0: a predictor that also gives them all exactly the same figure (points per match so far gives every unused player 0) is rewarded for the tie, while one that tells a 3% starter from a 10% one is marked down for it, though no pick changes. The "Playing time and ordering" section below separates the two things it mixes.`);

  for (const set of sets) {
    out.push("");
    out.push(`## ${set.name} (${set.note})`);
    out.push("");
    // Like for like: rows every model has a figure for.
    const common = set.rows.filter((r) => MODELS.every((m) => r.preds[m] !== null));
    const all = [...MODELS, "newNoFixture"].map((m) => ({ m, x: metrics(common, m) }));
    out.push(`${common.length} player-matches (of ${set.rows.length}: the replaced model has no figure for the rest — no minutes on record).`);
    out.push("");
    out.push(
      table(
        ["Model", "RMSE", "MAE", "Bias", "Correlation", "Top 5 per position", "Top 10", "Captain", "Rank (ties)"],
        all.map(({ m, x }) => [LABEL[m], f3(x.rmse), f3(x.mae), (x.bias >= 0 ? "+" : "") + f3(x.bias), f3(x.corr), f2(x.top5), f2(x.top10), f2(x.captain), f3(x.rankCorr)]),
      ),
    );
    const newAll = metrics(set.rows, "new");
    out.push("");
    out.push(`The new model on every row of the set (${newAll.n}, including players with no minutes on record): RMSE ${f3(newAll.rmse)}, bias ${f3(newAll.bias)}, correlation ${f3(newAll.corr)}.`);
    out.push("");
    out.push("By position (correlation; RMSE; average actual points of the top 5 picks):");
    out.push("");
    out.push(
      table(
        ["Position", ...MODELS.map((m) => LABEL[m])],
        POSITIONS.map((pos) => {
          const p = common.filter((r) => r.s.position === pos);
          return [pos, ...MODELS.map((m) => {
            const x = metrics(p, m);
            return `${f3(x.corr)}; ${f2(x.rmse)}; ${f2(x.top5)}`;
          })];
        }),
      ),
    );
    (json.sets as unknown[]).push({ name: set.name, note: set.note, n: common.length, metrics: Object.fromEntries(all.map(({ m, x }) => [m, x])), byPosition: Object.fromEntries(POSITIONS.map((pos) => [pos, Object.fromEntries(MODELS.map((m) => [m, metrics(common.filter((r) => r.s.position === pos), m)]))])) });
  }

  // <rank_ties>: the two things a rank correlation over everyone mixes, apart.
  out.push("");
  out.push("## Playing time and ordering (2025/26 and 2026/27)");
  out.push("");
  out.push("Who starts: how well each model's figure separates the players who started from those who didn't (AUC: 0.5 is a coin toss, 1 perfect). Among the players who did start: the correlation of each model's figure with the points they scored.");
  out.push("");
  const auc = (scores: number[], labels: boolean[]) => {
    const pairs = scores.map((v, i) => [v, labels[i]] as const).sort((a, b) => a[0] - b[0]);
    let rankSum = 0;
    let positives = 0;
    let i = 0;
    while (i < pairs.length) {
      let j = i;
      while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[i][0]) j++;
      for (let k = i; k <= j; k++) {
        if (pairs[k][1]) {
          rankSum += (i + j) / 2 + 1;
          positives++;
        }
      }
      i = j + 1;
    }
    const negatives = pairs.length - positives;
    return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
  };
  const orderRows: string[][] = [];
  const orderJson: Record<string, unknown> = {};
  for (const pos of POSITIONS) {
    const rs = rows.filter((r) => r.s.position === pos && MODELS.every((m) => r.preds[m] !== null));
    const starters = rs.filter((r) => r.s.actual.started);
    const cells = MODELS.map((m) => ({
      auc: auc(rs.map((r) => r.preds[m]!), rs.map((r) => r.s.actual.started)),
      corr: pearson(starters.map((r) => r.preds[m]!), starters.map((r) => r.actual)),
    }));
    orderRows.push([pos, ...cells.map((c) => `${f3(c.auc)}; ${f3(c.corr)}`)]);
    orderJson[pos] = Object.fromEntries(MODELS.map((m, i) => [m, cells[i]]));
  }
  out.push(table(["Position", ...MODELS.map((m) => `${LABEL[m]} (AUC; starters)`)], orderRows));
  json.ordering = orderJson;

  // Calibration of the total and of each part (the new model, every 2025/26+ row).
  out.push("");
  out.push("## Calibration (new model, 2025/26 and 2026/27)");
  out.push("");
  out.push("Players grouped by predicted points: the average prediction against the average actual.");
  out.push("");
  const sorted = [...rows].sort((a, b) => a.preds.new! - b.preds.new!);
  const bins = 10;
  const calib: unknown[] = [];
  const calibRows: string[][] = [];
  for (let b = 0; b < bins; b++) {
    const slice = sorted.slice(Math.floor((b * sorted.length) / bins), Math.floor(((b + 1) * sorted.length) / bins));
    const p = mean(slice.map((r) => r.preds.new!));
    const a = mean(slice.map((r) => r.actual));
    calib.push({ predicted: p, actual: a, n: slice.length });
    calibRows.push([`${b + 1}`, f2(p), f2(a), `${slice.length}`]);
  }
  out.push(table(["Tenth", "Predicted", "Actual", "Player-matches"], calibRows));
  json.calibration = calib;

  out.push("");
  out.push("Each part: average predicted against average actually paid, per player-match.");
  out.push("");
  const parts = ["appearance", "goals", "assists", "cleanSheet", "goalsConceded", "saves", "defensiveContribution", "bonus", "cards"] as const;
  const partRows: string[][] = [];
  const partJson: Record<string, unknown> = {};
  for (const pos of POSITIONS) {
    const rs = rows.filter((r) => r.s.position === pos);
    for (const part of parts) {
      const withActual = rs.map((r) => ({ p: r.model[part], a: actualParts(r.s)[part] })).filter((x) => x.a !== null);
      if (withActual.every((x) => x.p === 0 && x.a === 0)) continue;
      const p = mean(withActual.map((x) => x.p));
      const a = mean(withActual.map((x) => x.a!));
      partRows.push([pos, part, f3(p), f3(a)]);
      partJson[`${pos}.${part}`] = { predicted: p, actual: a };
    }
  }
  out.push(table(["Position", "Part", "Predicted", "Actual"], partRows));
  json.parts = partJson;

  // Playing time: chance of starting, grouped.
  out.push("");
  out.push("Chance of starting, grouped: predicted against how often they started.");
  out.push("");
  const startBins = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.01];
  const startRows: string[][] = [];
  const startJson: unknown[] = [];
  for (let i = 0; i < startBins.length - 1; i++) {
    const rs = rows.filter((r) => r.model.startChance >= startBins[i] && r.model.startChance < startBins[i + 1]);
    if (!rs.length) continue;
    const p = mean(rs.map((r) => r.model.startChance));
    const a = mean(rs.map((r) => (r.s.actual.started ? 1 : 0)));
    startRows.push([`${pct(startBins[i])}–${pct(Math.min(1, startBins[i + 1]))}`, pct(p), pct(a), `${rs.length}`]);
    startJson.push({ predicted: p, actual: a, n: rs.length });
  }
  out.push(table(["Predicted", "Average predicted", "Started", "Player-matches"], startRows));
  json.startCalibration = startJson;

  const docs = path.join(ROOT, "docs/models");
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, "model-predicted-backtest.md"), out.join("\n") + "\n");
  fs.writeFileSync(path.join(HERE, "backtest-results.json"), JSON.stringify(json, null, 2));
  console.log(out.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
