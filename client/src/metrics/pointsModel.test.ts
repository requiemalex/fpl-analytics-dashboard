import { describe, it, expect } from "vitest";
import {
  chanceAtLeast,
  expectedEvery,
  fixtureOutlook,
  predictMatch,
  returnFromAbsence,
  SCORING_RULES,
  sellOff,
  SELL_OFF_SMOOTHING,
  separatesPenalties,
  startFeatures,
  type FixtureOutlook,
  type ModelBreakdown,
  type PlayerEvidence,
  type SeasonTotals,
} from "./pointsModel";
import { MODEL_PARAMS } from "./pointsModelParams.generated";
import { liveTransfers, modelForFixture, playerEvidence } from "./pointsModelLive";
import type { ClubRatings } from "./fixtureForecast";
import type { UpcomingFixture } from "./fixtureTicker";
import { buildHistoricPlayerProfile } from "./historicAnalysis";
import { makePlayer, makeSeason } from "../test/fixtures";
import type { Position } from "../types/normalized";

const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

// FPL's own 2026/27 scoring, from the live bootstrap-static game_config.scoring (fetched 2026-10-18).
const FPL_SCORING = {
  assists: 3,
  saves: 1,
  goals_scored: { GKP: 10, DEF: 6, MID: 5, FWD: 4 },
  clean_sheets: { GKP: 4, DEF: 4, MID: 1, FWD: 0 },
  goals_conceded: { GKP: -1, DEF: -1, MID: 0, FWD: 0 },
  defensive_contribution: { GKP: 0, DEF: 2, MID: 2, FWD: 2 },
  yellow_cards: -1,
  red_cards: -3,
  own_goals: -2,
  penalties_missed: -2,
  penalties_saved: 5,
};

const totals = (o: Partial<SeasonTotals> = {}): SeasonTotals => ({
  minutes: 900,
  starts: 10,
  goals: 4,
  assists: 2,
  xG: 4,
  xA: 2,
  dc: 60,
  saves: 0,
  bonus: 6,
  yellowCards: 2,
  penaltiesTaken: null,
  penaltyGoals: null,
  ...o,
});
const evidence = (o: Partial<PlayerEvidence> = {}): PlayerEvidence => ({
  position: "MID",
  price: 7,
  current: totals(),
  matches: Array.from({ length: 10 }, () => ({ started: true, minutes: 90 })),
  past: [],
  penaltyTaker: null,
  availability: 1,
  transfers: null,
  ...o,
});
const outlook = (o: Partial<FixtureOutlook> = {}): FixtureOutlook => ({ goalsFor: 1.4, goalsAgainst: 1.3, baseFor: 1.4, baseAgainst: 1.3, win: 0.4, baseWin: 0.4, ...o });
const PARTS = ["appearance", "goals", "assists", "cleanSheet", "goalsConceded", "saves", "defensiveContribution", "bonus", "cards"] as const;
const sumParts = (b: ModelBreakdown) => PARTS.reduce((s, k) => s + b[k], 0);

describe("Model Predicted — scoring rules match FPL 2026/27", () => {
  it.each(POSITIONS)("%s point values equal game_config.scoring", (pos) => {
    expect(SCORING_RULES.goal[pos]).toBe(FPL_SCORING.goals_scored[pos]);
    expect(SCORING_RULES.cleanSheet[pos]).toBe(FPL_SCORING.clean_sheets[pos]);
    expect(SCORING_RULES.goalsConcededPer2[pos]).toBe(FPL_SCORING.goals_conceded[pos]);
    const dc = SCORING_RULES.defensiveContributionThreshold[pos] === null ? 0 : SCORING_RULES.defensiveContribution;
    expect(dc).toBe(FPL_SCORING.defensive_contribution[pos]);
  });
  it("the per-event values match", () => {
    expect(SCORING_RULES.assist).toBe(FPL_SCORING.assists);
    expect(SCORING_RULES.savesPer3).toBe(FPL_SCORING.saves);
    expect(SCORING_RULES.yellowCard).toBe(FPL_SCORING.yellow_cards);
    expect(SCORING_RULES.redCard).toBe(FPL_SCORING.red_cards);
    expect(SCORING_RULES.ownGoal).toBe(FPL_SCORING.own_goals);
    expect(SCORING_RULES.penaltyMiss).toBe(FPL_SCORING.penalties_missed);
    expect(SCORING_RULES.penaltySave).toBe(FPL_SCORING.penalties_saved);
    expect(SCORING_RULES.defensiveContributionThreshold).toEqual({ GKP: null, DEF: 10, MID: 12, FWD: 12 });
  });
});

describe("Model Predicted — distributions", () => {
  const poissonPmf = (k: number, l: number) => (Math.exp(-l) * l ** k) / [...Array(k).keys()].reduce((f, i) => f * (i + 1), 1);
  it("chanceAtLeast is the Poisson tail at dispersion 1", () => {
    expect(chanceAtLeast(1, 0.8)).toBeCloseTo(1 - Math.exp(-0.8), 10);
    const tail = 1 - [...Array(10).keys()].reduce((s, k) => s + poissonPmf(k, 7.5), 0);
    expect(chanceAtLeast(10, 7.5)).toBeCloseTo(tail, 8);
    expect(chanceAtLeast(10, 0)).toBe(0);
  });
  it("a wider spread (dispersion > 1) makes a far threshold likelier and a near one less likely", () => {
    expect(chanceAtLeast(12, 6, 1.3)).toBeGreaterThan(chanceAtLeast(12, 6));
    expect(chanceAtLeast(4, 8, 1.3)).toBeLessThan(chanceAtLeast(4, 8));
  });
  it("expectedEvery is E[floor(X / per)] for a Poisson X (what 'a point per 2 conceded' pays)", () => {
    for (const [per, l] of [
      [2, 1.3],
      [3, 3.4],
      [2, 0.2],
    ]) {
      const brute = [...Array(40).keys()].reduce((s, k) => s + Math.floor(k / per) * poissonPmf(k, l), 0);
      expect(expectedEvery(per, l)).toBeCloseTo(brute, 6);
    }
    expect(expectedEvery(2, 0)).toBe(0);
  });
});

describe("Model Predicted — one match", () => {
  it.each(POSITIONS)("%s: the parts add up to the total, every figure finite", (pos) => {
    const b = predictMatch(evidence({ position: pos }), outlook(), MODEL_PARAMS);
    for (const k of PARTS) expect(Number.isFinite(b[k])).toBe(true);
    expect(b.total).toBeCloseTo(sumParts(b), 10);
    expect(b.goalsConceded).toBeLessThanOrEqual(0);
    expect(b.cards).toBeLessThanOrEqual(0);
  });
  it("each position only scores what FPL scores it for", () => {
    const gk = predictMatch(evidence({ position: "GKP", current: totals({ saves: 30, dc: 0, goals: 0, xG: 0 }) }), outlook(), MODEL_PARAMS);
    expect(gk.defensiveContribution).toBe(0);
    expect(gk.saves).toBeGreaterThan(0);
    const fwd = predictMatch(evidence({ position: "FWD" }), outlook(), MODEL_PARAMS);
    expect(fwd.cleanSheet).toBe(0);
    expect(fwd.goalsConceded).toBe(0);
    expect(fwd.saves).toBe(0);
  });
  it("unavailable (0% chance of playing): nothing", () => {
    const b = predictMatch(evidence({ availability: 0 }), outlook(), MODEL_PARAMS);
    expect(b.startChance).toBe(0);
    expect(b.expectedMinutes).toBe(0);
    expect(b.total).toBe(0);
    expect(b.notes).toContain("0% chance of being available");
  });
  it("availability scales playing time", () => {
    const full = predictMatch(evidence(), outlook(), MODEL_PARAMS);
    const doubt = predictMatch(evidence({ availability: 0.5 }), outlook(), MODEL_PARAMS);
    expect(doubt.startChance).toBeCloseTo(full.startChance * 0.5, 10);
    expect(doubt.total).toBeLessThan(full.total);
  });
  it("an easier match (more goals for, fewer against, likelier win) is worth more", () => {
    const def = (o: Partial<FixtureOutlook>) => predictMatch(evidence({ position: "DEF" }), outlook(o), MODEL_PARAMS);
    const easy = def({ goalsFor: 2.2, goalsAgainst: 0.7, win: 0.65 });
    const hard = def({ goalsFor: 0.8, goalsAgainst: 2.1, win: 0.15 });
    expect(easy.goals).toBeGreaterThan(hard.goals);
    expect(easy.cleanSheet).toBeGreaterThan(hard.cleanSheet);
    expect(easy.goalsConceded).toBeGreaterThan(hard.goalsConceded);
    expect(easy.bonus).toBeGreaterThan(hard.bonus);
    // Defensive contribution is his own rate: the opponent doesn't move it.
    expect(easy.defensiveContribution).toBeCloseTo(hard.defensiveContribution, 10);
  });
  it("recent starts drive the chance of starting, the last one most", () => {
    const starter = predictMatch(evidence(), outlook(), MODEL_PARAMS);
    const benched = predictMatch(evidence({ matches: Array.from({ length: 10 }, () => ({ started: false, minutes: 0 })) }), outlook(), MODEL_PARAMS);
    expect(starter.startChance).toBeGreaterThan(0.8);
    expect(benched.startChance).toBeLessThan(0.1);
    const dropped = evidence({ matches: [...Array.from({ length: 9 }, () => ({ started: true, minutes: 90 })), { started: false, minutes: 0 }] });
    const recalled = evidence({ matches: [{ started: false, minutes: 0 }, ...Array.from({ length: 9 }, () => ({ started: true, minutes: 90 }))] });
    expect(startFeatures(dropped).seasonShare).toBe(startFeatures(recalled).seasonShare);
    expect(predictMatch(recalled, outlook(), MODEL_PARAMS).startChance).toBeGreaterThan(predictMatch(dropped, outlook(), MODEL_PARAMS).startChance);
  });
  it("a starter who plays the 90 is expected to play longer than one taken off at 60", () => {
    const ninety = predictMatch(evidence(), outlook(), MODEL_PARAMS);
    const sixty = predictMatch(evidence({ matches: Array.from({ length: 10 }, () => ({ started: true, minutes: 61 })) }), outlook(), MODEL_PARAMS);
    expect(ninety.expectedMinutes).toBeGreaterThan(sixty.expectedMinutes);
  });
  it("no Premier League minutes: a figure from position and price, and the hover says so", () => {
    const b = predictMatch(evidence({ current: null, matches: [], past: [] }), outlook(), MODEL_PARAMS);
    expect(b.total).toBeGreaterThan(0);
    expect(b.notes[0]).toContain("no Premier League minutes on record");
    const cheap = predictMatch(evidence({ current: null, matches: [], past: [], price: 4.5 }), outlook(), MODEL_PARAMS);
    const dear = predictMatch(evidence({ current: null, matches: [], past: [], price: 10 }), outlook(), MODEL_PARAMS);
    expect(dear.startChance).toBeGreaterThan(cheap.startChance);
    expect(dear.goals).toBeGreaterThan(cheap.goals);
  });
  it("past seasons count, less than this one", () => {
    const strongPast = evidence({ current: totals({ minutes: 270, starts: 3, goals: 0, xG: 0.3 }), past: [{ ...totals({ minutes: 3000, starts: 34, goals: 18, xG: 16 }), seasonsAgo: 1 }] });
    const noPast = evidence({ current: totals({ minutes: 270, starts: 3, goals: 0, xG: 0.3 }) });
    expect(predictMatch(strongPast, outlook(), MODEL_PARAMS).goals).toBeGreaterThan(predictMatch(noPast, outlook(), MODEL_PARAMS).goals);
  });
  it("no defensive-contribution points in a season without the rule", () => {
    const rules = { ...SCORING_RULES, defensiveContribution: 0 };
    expect(predictMatch(evidence({ position: "DEF" }), outlook(), MODEL_PARAMS, rules).defensiveContribution).toBe(0);
  });
  it("penalties are only modelled apart with penalty evidence for every season in use", () => {
    expect(separatesPenalties(evidence())).toBe(false);
    const withPens = (taker: boolean) =>
      evidence({ position: "FWD", penaltyTaker: taker, current: totals({ xG: 4.79, goals: 5, penaltiesTaken: 1, penaltyGoals: 1 }) });
    expect(separatesPenalties(withPens(true))).toBe(true);
    expect(predictMatch(withPens(true), outlook(), MODEL_PARAMS).goals).toBeGreaterThan(predictMatch(withPens(false), outlook(), MODEL_PARAMS).goals);
  });
});

describe("Model Predicted — the match outlook", () => {
  const ratings: ClubRatings = {
    attack: new Map([
      [1, 1.3],
      [2, 0.8],
    ]),
    defence: new Map([
      [1, 0.8],
      [2, 1.2],
    ]),
    homeGoals: 1.55,
    awayGoals: 1.25,
  };
  it("goals each way are the Fixture Forecast's: league average × attack × the opponent's defence", () => {
    const o = fixtureOutlook(ratings, 1, 2, true)!;
    expect(o.goalsFor).toBeCloseTo(1.55 * 1.3 * 1.2, 10);
    expect(o.goalsAgainst).toBeCloseTo(1.25 * 0.8 * 0.8, 10);
    expect(o.baseFor).toBeCloseTo(((1.55 + 1.25) / 2) * 1.3, 10);
    expect(o.win).toBeGreaterThan(o.baseWin);
    expect(o.win).toBeLessThan(1);
  });
  it("no figure for a club without a rating", () => {
    expect(fixtureOutlook(ratings, 1, 99, true)).toBeNull();
  });
});

describe("Model Predicted — from the app's data (<points_model_evidence>)", () => {
  const player = makePlayer({ id: 1, position: "MID", price: 7.5, minutes: 450, starts: 5, goals: 2, xG: 1.8, status: "a", chanceOfPlayingNextRound: null });
  const matches = Array.from({ length: 5 }, () => ({ started: true, minutes: 90 }));
  const profile = buildHistoricPlayerProfile(
    [makeSeason({ seasonName: "2022/23", minutes: 2000 }), makeSeason({ seasonName: "2024/25", minutes: 2500 }), makeSeason({ seasonName: "2025/26", minutes: 0 })],
    "2025/26",
  );
  it("this season's totals, his matches and his last three completed seasons with minutes", () => {
    const e = playerEvidence(player, profile, matches, "2025/26", null)!;
    expect(e.current?.minutes).toBe(450);
    expect(e.current?.xG).toBe(1.8);
    expect(e.matches).toBe(matches);
    // 2025/26 had no minutes; 2022/23 is four seasons back.
    expect(e.past.map((p) => p.seasonsAgo)).toEqual([2]);
    expect(e.availability).toBe(1);
  });
  it("no figure without his matches or his availability, never a guess", () => {
    expect(playerEvidence(player, profile, undefined, "2025/26", null)).toBeNull();
    expect(playerEvidence(makePlayer({ id: 2, position: "MID", status: "", chanceOfPlayingNextRound: null }), profile, matches, "2025/26", null)).toBeNull();
  });
  it("pre-season (no matches yet): no current season", () => {
    expect(playerEvidence(player, profile, [], "2025/26", null)!.current).toBeNull();
  });
  it("a match figure needs both clubs' ratings", () => {
    const e = playerEvidence(player, profile, matches, "2025/26", null);
    const fx: UpcomingFixture = { fixtureId: 1, eventId: 9, opponentTeamId: 2, opponentShortName: "OPP", isHome: true, difficulty: 3 };
    const ratings: ClubRatings = { attack: new Map([[10, 1]]), defence: new Map([[10, 1]]), homeGoals: 1.5, awayGoals: 1.2 };
    expect(modelForFixture(e, null, 10, 10, fx, 9)).toBeNull();
    expect(modelForFixture(e, ratings, 10, null, fx, 9)).toBeNull();
    expect(modelForFixture(e, ratings, 10, 10, fx, 9)?.total).toBeGreaterThan(0);
  });
  it("his transfers toward the next deadline: owners from ownership % × total managers; none when any part is missing", () => {
    const p = makePlayer({ id: 3, position: "MID", ownership: 12.5, transfersInEvent: 4000, transfersOutEvent: 90000, status: "a", chanceOfPlayingNextRound: null });
    expect(liveTransfers(p, 2_000_000)).toEqual({ in: 4000, out: 90000, owners: 250000 });
    expect(liveTransfers(p, null)).toBeNull();
    expect(liveTransfers({ ...p, transfersOutEvent: null }, 2_000_000)).toBeNull();
    expect(playerEvidence(p, profile, matches, "2025/26", 2_000_000)!.transfers).toEqual({ in: 4000, out: 90000, owners: 250000 });
  });
  it("transfers count only toward the gameweek they're made for", () => {
    const p = makePlayer({ id: 3, position: "MID", ownership: 12.5, transfersInEvent: 1000, transfersOutEvent: 120000, status: "a", chanceOfPlayingNextRound: null });
    const e = playerEvidence(p, profile, matches, "2025/26", 2_000_000);
    const ratings: ClubRatings = { attack: new Map([[10, 1]]), defence: new Map([[10, 1]]), homeGoals: 1.5, awayGoals: 1.2 };
    const fx = (eventId: number): UpcomingFixture => ({ fixtureId: eventId, eventId, opponentTeamId: 2, opponentShortName: "OPP", isHome: true, difficulty: 3 });
    const withNoTransfers = modelForFixture({ ...e!, transfers: null }, ratings, 10, 10, fx(9), 9)!;
    // GW9 is the next deadline: the sell-off counts.
    expect(modelForFixture(e, ratings, 10, 10, fx(9), 9)!.startChance).toBeLessThan(withNoTransfers.startChance);
    // GW10 is a later one: it doesn't.
    expect(modelForFixture(e, ratings, 10, 10, fx(10), 9)!.startChance).toBeCloseTo(withNoTransfers.startChance, 12);
  });
});

describe("Model Predicted — back from an absence (<return_from_absence>)", () => {
  const m = (minutes: number, started = minutes >= 60) => ({ minutes, started });
  it("his first match back after missing 3+ in a row, then his second", () => {
    expect(returnFromAbsence(evidence({ matches: [m(90), m(0), m(0), m(0), m(70)] }))).toEqual({ matchesBack: 1, missed: 3 });
    expect(returnFromAbsence(evidence({ matches: [m(90), m(0), m(0), m(0), m(0), m(20, false), m(90)] }))).toEqual({ matchesBack: 2, missed: 4 });
  });
  it("not after missing fewer than 3, not from the third match back, not while still out", () => {
    expect(returnFromAbsence(evidence({ matches: [m(90), m(0), m(0), m(90)] }))).toBeNull();
    expect(returnFromAbsence(evidence({ matches: [m(0), m(0), m(0), m(90), m(90), m(90)] }))).toBeNull();
    expect(returnFromAbsence(evidence({ matches: [m(90), m(0), m(0), m(0)] }))).toBeNull();
    expect(returnFromAbsence(evidence({ matches: [] }))).toBeNull();
  });
  it("feeds the chance of starting (a fitted lift) and says so in the hover", () => {
    const back = evidence({ matches: [m(90), m(90), m(0), m(0), m(0), m(75)] });
    expect(startFeatures(back)).toMatchObject({ returnFirst: 1, returnSecond: 0 });
    const b = predictMatch(back, outlook(), MODEL_PARAMS);
    expect(b.notes).toContain("first match back after missing 3: allowed for in his chance of starting");
    expect(MODEL_PARAMS.byPosition.MID.start.returnFirst).toBeGreaterThan(0);
  });
});

describe("Model Predicted — managers selling him before the deadline (<transfer_signal>)", () => {
  it("net selling as a share of the managers who owned him, on a log scale, smoothed", () => {
    const t = { in: 5000, out: 45000, owners: 200000 };
    expect(sellOff(t)).toBeCloseTo(Math.log((200000 + SELL_OFF_SMOOTHING) / (240000 + SELL_OFF_SMOOTHING)), 12);
    // A few transfers of a barely-owned player barely move it.
    expect(Math.abs(sellOff({ in: 0, out: 30, owners: 20 }))).toBeLessThan(0.01);
  });
  it("buying isn't read: more in than out, or none at all, is 0", () => {
    expect(sellOff({ in: 300000, out: 1000, owners: 800000 })).toBe(0);
    expect(sellOff({ in: 0, out: 0, owners: 50000 })).toBe(0);
    expect(startFeatures(evidence({ transfers: { in: 300000, out: 1000, owners: 800000 } })).sellOff).toBe(0);
  });
  it("unknown transfers add nothing", () => {
    expect(startFeatures(evidence({ transfers: null })).sellOff).toBe(0);
  });
  it("a regular being sold is less likely to start, and the hover says why", () => {
    const sold = predictMatch(evidence({ transfers: { in: 2000, out: 300000, owners: 700000 } }), outlook(), MODEL_PARAMS);
    const quiet = predictMatch(evidence({ transfers: { in: 10000, out: 10000, owners: 1000000 } }), outlook(), MODEL_PARAMS);
    const bought = predictMatch(evidence({ transfers: { in: 300000, out: 2000, owners: 1000000 } }), outlook(), MODEL_PARAMS);
    expect(sold.startChance).toBeLessThan(quiet.startChance);
    expect(sold.total).toBeLessThan(quiet.total);
    expect(bought.startChance).toBeCloseTo(quiet.startChance, 12);
    expect(sold.notes.some((n) => n.startsWith("managers selling him before the deadline (net 30% of his owners)"))).toBe(true);
    expect(quiet.notes.some((n) => n.startsWith("managers"))).toBe(false);
  });
});

describe("Model Predicted — fitted settings", () => {
  it("every position has every setting, all finite", () => {
    const finite = (x: unknown): boolean => (typeof x === "number" ? Number.isFinite(x) : x !== null && typeof x === "object" ? Object.values(x).every(finite) : false);
    for (const pos of POSITIONS) expect(finite(MODEL_PARAMS.byPosition[pos])).toBe(true);
    expect(finite({ ...MODEL_PARAMS, byPosition: 0 })).toBe(true);
  });
});

// The probability helpers work each P(X = k) out once and carry their
// running totals on rather than restarting them; these are the plain
// versions they replaced, which every figure must still match exactly.
function referenceLogGamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - referenceLogGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function referencePmf(k: number, mean: number, dispersion: number): number {
  if (mean <= 0) return k === 0 ? 1 : 0;
  if (dispersion <= 1.0001) return Math.exp(-mean + k * Math.log(mean) - referenceLogGamma(k + 1));
  const r = mean / (dispersion - 1);
  const p = r / (r + mean);
  return Math.exp(referenceLogGamma(k + r) - referenceLogGamma(r) - referenceLogGamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p));
}
function referenceChanceAtLeast(threshold: number, mean: number, dispersion = 1): number {
  if (mean <= 0) return 0;
  let below = 0;
  for (let k = 0; k < threshold; k++) below += referencePmf(k, mean, dispersion);
  return Math.min(1, Math.max(0, 1 - below));
}
function referenceExpectedEvery(per: number, mean: number): number {
  if (mean <= 0) return 0;
  let total = 0;
  for (let j = 1; j < 60; j++) {
    const p = referenceChanceAtLeast(j * per, mean);
    total += p;
    if (p < 1e-7) break;
  }
  return total;
}

describe("Model Predicted — the probability helpers give exactly the plain calculation's figures", () => {
  const means = [0, -1, 1e-9, 0.001, 0.05, 0.3, 0.9, 1.4, 2.5, 4, 7.3, 12, 19];
  it("chanceAtLeast, Poisson and over-dispersed", () => {
    for (const mean of means)
      for (const dispersion of [1, 1.00005, 1.0001, 1.00011, 1.2, 1.5, 2, 3.7])
        for (let threshold = 0; threshold <= 30; threshold++) expect(chanceAtLeast(threshold, mean, dispersion)).toBe(referenceChanceAtLeast(threshold, mean, dispersion));
  });
  it("expectedEvery", () => {
    for (const mean of means) for (const per of [1, 2, 3, 4]) expect(expectedEvery(per, mean)).toBe(referenceExpectedEvery(per, mean));
  });
});
