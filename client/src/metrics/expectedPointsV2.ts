import type { NormalizedPlayer, NormalizedTeam, Position } from "../types/normalized";
import type { UpcomingFixture } from "./fixtureTicker";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { fixtureMultiplier, FDR_SENSITIVITY, type ExpectedPointsWindow } from "./expectedPoints";
import { per90 } from "./calculations";

/**
 * Expected Points — Tier 2: an independent, per-scoring-event estimate,
 * built entirely from this app's own normalized stats and FPL's actual
 * scoring rules — never FPL's own `ep_next` figure (that's Tier 1, in
 * expectedPoints.ts, left completely unmodified). Where Tier 1 trusts a
 * single published number and only extends it via fixture difficulty,
 * Tier 2 estimates each scoring event's rate/probability separately
 * (appearance, goals, assists, clean sheet, goals conceded, saves,
 * defensive contribution, bonus) and sums the results.
 *
 * This is deliberately a SEPARATE module. It is not wired into any page
 * yet, and does not replace computeExpectedPointsForWindow anywhere —
 * see README's "Expected Points — Tier 2" section for why (in short: an
 * unvalidated model shouldn't quietly replace a working one; see
 * scripts/backtestExpectedPoints.ts for the validation this app's own
 * conventions require before that changes).
 *
 * Scoring values below are FPL's actual, current 2026/27 rules —
 * cross-checked directly, not recalled from training data, since FPL
 * has changed these across recent seasons (Defensive Contribution is new
 * for 2025/26). Every non-trivial modelling choice below is documented
 * inline and in README — this file follows the same "judgement calls,
 * not fitted coefficients, always labelled as such" convention as
 * FDR_SENSITIVITY in expectedPoints.ts.
 *
 * <deliberately_still_per90>: every rate here is computed inline via
 * `per90(total, player.minutes)`, not read off the player's own
 * xGPerGame/xAPerGame/etc. fields — this app moved every DISPLAY metric
 * to a per-game basis (see <per_game_not_per_90>, calculations.ts), but
 * this model multiplies each rate by `expectedMinutesFraction` (a
 * fraction of ONE upcoming match's minutes), which is only coherent
 * against a genuinely per-90-MINUTES rate. "How many games this player
 * has appeared in so far" has no bearing on "how much of the next single
 * match they'll be on the pitch for", so per-game does not apply here.
 */

interface PositionScoring {
  playing1to59: number;
  playing60plus: number;
  goal: number;
  assist: number;
  cleanSheet: number;
  /** Per save, already divided by 3 conceptually applied at compute time — GK only, 0 elsewhere. */
  everyThreeSaves: number;
  /** GK only — not modelled (see caveats), kept here only for completeness/documentation. */
  penaltySave: number;
  /** Negative — GK/DEF only, 0 for MID/FWD (their goals-conceded doesn't cost points). */
  everyTwoConceded: number;
  /** Flat +2 once the CBIT/CBIRT threshold is reached — 0 for GK, who have no defensive-contribution rule. */
  defensiveContribution: number;
}

export const SCORING_RULES: Record<Position, PositionScoring> = {
  GKP: { playing1to59: 1, playing60plus: 2, goal: 10, assist: 3, cleanSheet: 4, everyThreeSaves: 1, penaltySave: 5, everyTwoConceded: -1, defensiveContribution: 0 },
  DEF: { playing1to59: 1, playing60plus: 2, goal: 6, assist: 3, cleanSheet: 4, everyThreeSaves: 0, penaltySave: 0, everyTwoConceded: -1, defensiveContribution: 2 },
  MID: { playing1to59: 1, playing60plus: 2, goal: 5, assist: 3, cleanSheet: 1, everyThreeSaves: 0, penaltySave: 0, everyTwoConceded: 0, defensiveContribution: 2 },
  FWD: { playing1to59: 1, playing60plus: 2, goal: 4, assist: 3, cleanSheet: 0, everyThreeSaves: 0, penaltySave: 0, everyTwoConceded: 0, defensiveContribution: 2 },
};

/** CBIT (DEF) / CBIRT (MID, FWD) actions needed in one match to earn the flat +2 — null for GK, who have no defensive-contribution rule at all. */
export const DEFENSIVE_CONTRIBUTION_THRESHOLD: Record<Position, number | null> = {
  GKP: null,
  DEF: 10,
  MID: 12,
  FWD: 12,
};

/** Deliberately-omitted components, always surfaced so nobody mistakes silence for "this model accounts for everything". Cards, red cards, own goals, and penalty misses are small, rare, and this app has no per-player historic rate for any of them normalized anywhere — modelling them from nothing would be worse than naming the gap. Penalty saves are the same story for goalkeepers specifically. */
const OMITTED_EVENT_CAVEATS = [
  "Yellow cards, red cards, own goals, and penalty misses are not modelled (assumed zero) — small, rare events with no per-player historic rate normalized in this app.",
  "Penalty saves are not modelled (assumed zero) — most goalkeepers face none all season, and there's no per-player penalty-save rate available to estimate one from.",
];

export interface ExpectedPointsV2Breakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  /** Always ≤ 0 (or 0 for MID/FWD, who have no goals-conceded penalty). */
  goalsConceded: number;
  /** GK only — 0 for outfield players. */
  saves: number;
  /** 0 for GK, who have no defensive-contribution rule. */
  defensiveContribution: number;
  bonus: number;
  total: number;
  /** Every caveat that applied to this specific estimate — missing inputs and the deliberately-omitted event types both land here, deduplicated across a multi-fixture window. Read before trusting the total at face value. */
  caveats: string[];
}

function emptyBreakdown(): ExpectedPointsV2Breakdown {
  return { appearance: 0, goals: 0, assists: 0, cleanSheet: 0, goalsConceded: 0, saves: 0, defensiveContribution: 0, bonus: 0, total: 0, caveats: [] };
}

export interface MinutesModel {
  /** Expected share of a full 90-minute match, 0-1 — the same blended, availability-adjusted reliability figure already shown elsewhere (see minutesReliabilityBlend.ts), reused here as the one shared input scaling every rate-based component below. */
  expectedMinutesFraction: number;
  /** Probability of playing 60+ minutes — gates clean sheets and the 2-point appearance bonus. */
  p60Plus: number;
  p1to59: number;
  p0: number;
}

/**
 * Judgement call, not a fitted parameter (same status as FDR_SENSITIVITY
 * below): how sharply playing time is assumed to cluster at the two
 * extremes (a full 60+ minute appearance, or none at all) rather than
 * spreading evenly across the 0-90 range. Chosen so a genuine 50/50
 * rotation player (reliability 0.5) still gets a meaningfully three-way
 * split, not a near-certain single outcome.
 */
const MINUTES_SKEW = 1.5;

/**
 * Splits a single blended reliability share into the three-way
 * play-60+/play-some/don't-play split FPL's appearance-points rule
 * actually needs — reliability alone can't distinguish "nailed-on
 * starter who occasionally rotates out entirely" from "impact sub who
 * always plays a bit," and this app has no real historical minutes-per-
 * appearance distribution to draw the split from directly. A power
 * curve (p60 = r^skew, p0 = (1-r)^skew, whatever's left over is p1-59)
 * captures the intuition — reliable players are disproportionately
 * "start and finish" or "rested entirely" rather than routinely subbed
 * at 55 minutes — without inventing a distribution this app can't back
 * up with data.
 */
export function splitMinutesProbability(reliability: number): MinutesModel {
  const r = Math.max(0, Math.min(1, reliability));
  const p60Plus = Math.pow(r, MINUTES_SKEW);
  const p0 = Math.pow(1 - r, MINUTES_SKEW);
  const p1to59 = Math.max(0, 1 - p60Plus - p0);
  return { expectedMinutesFraction: r, p60Plus, p1to59, p0 };
}

/** Poisson probability mass at exactly k, computed in log-space (thresholds here are only ever 10-12, but this avoids any factorial-overflow surprise regardless). */
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** P(X ≥ threshold) for X ~ Poisson(lambda) — 1 minus the CDF up to threshold-1. */
function poissonAtLeast(threshold: number, lambda: number): number {
  if (lambda <= 0) return 0;
  let cumulativeBelow = 0;
  for (let k = 0; k < threshold; k++) cumulativeBelow += poissonPmf(k, lambda);
  return Math.max(0, Math.min(1, 1 - cumulativeBelow));
}

/** League-wide rough clean-sheet rate per match — an anchor, not a fitted constant, used only when team-strength data is unavailable and as the zero-point of the strength-differential adjustment below. */
const BASE_CLEAN_SHEET_RATE = 0.28;
/** Points of expected clean-sheet probability moved per point of team-strength differential (FPL's overall ratings run roughly 2-5) — a judgement call, not fitted. */
const CLEAN_SHEET_STRENGTH_SENSITIVITY = 0.06;

/**
 * Clean sheet needs a genuine probability, not a rate — it's a
 * threshold, flat-value outcome, unlike goals/assists which pay per
 * event with no cap. Estimated from the defending side's own
 * home/away-specific overall strength rating vs. the attacking side's —
 * FPL's more granular strength_attack/strength_defence splits exist on
 * the raw API but read 0 for every team this early in the 2026/27
 * season (see raw.ts), so only the overall ratings are usable right
 * now. Falls back to the flat league-average anchor, not a guessed
 * direction, when either side's rating is unavailable.
 */
function estimateCleanSheetProbability(ownStrength: number | null, opponentStrength: number | null): number {
  if (ownStrength === null || opponentStrength === null) return BASE_CLEAN_SHEET_RATE;
  const differential = ownStrength - opponentStrength; // positive = the defending side rated stronger in this matchup
  return Math.max(0.03, Math.min(0.75, BASE_CLEAN_SHEET_RATE + differential * CLEAN_SHEET_STRENGTH_SENSITIVITY));
}

/**
 * One fixture's worth of Tier 2 expected points for one player. Every
 * component sums independently; see the file header for the overall
 * design and README for the fuller writeup including backtest results.
 */
export function computeExpectedPointsV2ForFixture(
  player: NormalizedPlayer,
  fixture: UpcomingFixture,
  ownTeam: NormalizedTeam | undefined,
  opponentTeam: NormalizedTeam | undefined,
  reliability: number,
  historicProfile: HistoricPlayerProfile | undefined,
): ExpectedPointsV2Breakdown {
  const rules = SCORING_RULES[player.position];
  const minutesModel = splitMinutesProbability(reliability);
  const caveats: string[] = [...OMITTED_EVENT_CAVEATS];

  const appearance = minutesModel.p60Plus * rules.playing60plus + minutesModel.p1to59 * rules.playing1to59;

  // Goal threat scaling reuses the app's own existing, already-documented
  // FDR-based fixture adjustment rather than inventing a second one —
  // one fixture-difficulty judgement call in this app, not two.
  const attackMultiplier = fixtureMultiplier(fixture.difficulty, player.position);

  // Genuinely per-90-minutes, computed fresh from this player's own
  // totals + minutes — see <deliberately_still_per90> at the top of this
  // file for why this doesn't use the app's display xGPerGame/etc. fields.
  const xGPer90 = per90(player.xG, player.minutes);
  const xAPer90 = per90(player.xA, player.minutes);
  const xGCPer90 = per90(player.xGC, player.minutes);
  const savesPer90 = per90(player.saves, player.minutes);
  const defensiveContributionsPer90 = per90(player.defensiveContributions, player.minutes);

  // Goals & assists pay per event with no cap, so expected points from
  // them is just rate x expected minutes x point value — no probability
  // distribution needed, unlike the threshold-based events below.
  let goals = 0;
  let assists = 0;
  if (xGPer90 !== null) goals = xGPer90 * minutesModel.expectedMinutesFraction * attackMultiplier * rules.goal;
  else caveats.push("No xG/90 data available for this player — goal contribution assumed zero.");
  if (xAPer90 !== null) assists = xAPer90 * minutesModel.expectedMinutesFraction * attackMultiplier * rules.assist;
  else caveats.push("No xA/90 data available for this player — assist contribution assumed zero.");

  let cleanSheet = 0;
  if (rules.cleanSheet > 0) {
    const ownStrength = fixture.isHome ? (ownTeam?.strengthOverallHome ?? null) : (ownTeam?.strengthOverallAway ?? null);
    const oppStrength = fixture.isHome ? (opponentTeam?.strengthOverallAway ?? null) : (opponentTeam?.strengthOverallHome ?? null);
    if (ownStrength === null || oppStrength === null) {
      caveats.push("Team strength ratings unavailable for this fixture — clean-sheet probability falls back to a flat league-average estimate.");
    }
    const pCleanSheet = estimateCleanSheetProbability(ownStrength, oppStrength);
    cleanSheet = pCleanSheet * minutesModel.p60Plus * rules.cleanSheet;
  }

  let goalsConceded = 0;
  if (rules.everyTwoConceded !== 0) {
    if (xGCPer90 !== null) {
      // Mirror image of the attack multiplier: a HARDER fixture (facing a
      // stronger attack) means MORE expected goals conceded, not fewer —
      // same FDR_SENSITIVITY constants, opposite sign on the difficulty term.
      const concedeMultiplier = 1 + (fixture.difficulty - 3) * FDR_SENSITIVITY[player.position];
      const expectedConceded = xGCPer90 * minutesModel.expectedMinutesFraction * concedeMultiplier;
      // "every 2 goals conceded" is a discrete floor() rule; E[floor(X/2)] is
      // approximated here as E[X]/2, a continuous relaxation — documented,
      // not hidden, and immaterial at the fractional-goal scale this
      // operates on anyway.
      goalsConceded = (expectedConceded / 2) * rules.everyTwoConceded;
    } else {
      caveats.push("No xGC/90 data available for this player — goals-conceded deduction assumed zero.");
    }
  }

  let saves = 0;
  if (rules.everyThreeSaves > 0) {
    if (savesPer90 !== null) {
      const expectedSaves = savesPer90 * minutesModel.expectedMinutesFraction;
      saves = (expectedSaves / 3) * rules.everyThreeSaves;
    } else {
      caveats.push("No saves/90 data available for this goalkeeper — saves contribution assumed zero.");
    }
  }

  let defensiveContribution = 0;
  const dcThreshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[player.position];
  if (dcThreshold !== null) {
    if (defensiveContributionsPer90 !== null) {
      const expectedActionsThisMatch = defensiveContributionsPer90 * minutesModel.expectedMinutesFraction;
      const pThresholdReached = poissonAtLeast(dcThreshold, expectedActionsThisMatch);
      defensiveContribution = pThresholdReached * rules.defensiveContribution;
    } else {
      caveats.push("No defensive-contribution/90 data available for this player — defensive-contribution points assumed zero.");
    }
    caveats.push(
      "Defensive contribution is a threshold on a PER-MATCH total, but only a per-90 season rate is available for the live model — approximated here via a Poisson distribution rather than real match-by-match action counts. This is the least certain component in this model; see README.",
    );
  }

  let bonus = 0;
  const qualifyingAvg = historicProfile?.qualifyingAverage;
  if (qualifyingAvg && qualifyingAvg.avgBonusPerSeason !== null && qualifyingAvg.avgMinutesPerSeason !== null && qualifyingAvg.avgMinutesPerSeason > 0) {
    const bonusPer90 = (qualifyingAvg.avgBonusPerSeason / qualifyingAvg.avgMinutesPerSeason) * 90;
    bonus = bonusPer90 * minutesModel.expectedMinutesFraction * attackMultiplier;
  } else {
    caveats.push("No qualifying historic season available for a bonus-points rate — bonus contribution assumed zero.");
  }
  caveats.push(
    "Bonus points are the roughest approximation in this model — BPS depends on how a player compares to 21 others in the same match, which nothing in this app's data can see directly. This is a historic bonus-per-90 rate scaled by fixture favourability, nothing more.",
  );

  const total = appearance + goals + assists + cleanSheet + goalsConceded + saves + defensiveContribution + bonus;
  return { appearance, goals, assists, cleanSheet, goalsConceded, saves, defensiveContribution, bonus, total, caveats };
}

/**
 * Sums computeExpectedPointsV2ForFixture across the player's next
 * `window` fixtures — same "next N fixtures, not calendar gameweeks"
 * unit as computeExpectedPointsForWindow in expectedPoints.ts, so the
 * two remain directly comparable. Returns null on the same terms Tier 1
 * does: no reliability figure at all, or no upcoming fixtures in the
 * window.
 */
export function computeExpectedPointsV2ForWindow(
  player: NormalizedPlayer,
  upcomingFixtures: UpcomingFixture[],
  window: ExpectedPointsWindow,
  teamsById: Map<number, NormalizedTeam>,
  reliability: number | null,
  historicProfile: HistoricPlayerProfile | undefined,
): ExpectedPointsV2Breakdown | null {
  if (reliability === null) return null;
  const fixtures = upcomingFixtures.slice(0, window);
  if (fixtures.length === 0) return null;

  const ownTeam = teamsById.get(player.teamId);
  const combined = emptyBreakdown();
  const caveatSet = new Set<string>();

  for (const fixture of fixtures) {
    const opponentTeam = teamsById.get(fixture.opponentTeamId);
    const single = computeExpectedPointsV2ForFixture(player, fixture, ownTeam, opponentTeam, reliability, historicProfile);
    combined.appearance += single.appearance;
    combined.goals += single.goals;
    combined.assists += single.assists;
    combined.cleanSheet += single.cleanSheet;
    combined.goalsConceded += single.goalsConceded;
    combined.saves += single.saves;
    combined.defensiveContribution += single.defensiveContribution;
    combined.bonus += single.bonus;
    combined.total += single.total;
    single.caveats.forEach((c) => caveatSet.add(c));
  }
  combined.caveats = Array.from(caveatSet);
  return combined;
}
