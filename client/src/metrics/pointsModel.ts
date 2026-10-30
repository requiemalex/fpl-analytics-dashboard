import type { Position, SeasonMatch } from "../types/normalized";
import type { ClubRatings } from "./fixtureForecast";

/**
 * <points_model>: Scoutline's Model Predicted expected points (README "Team
 * Building — Model Predicted"). One match, one player: every way FPL scores
 * him, each as its own expectation, added up.
 *
 * Everything here is pure: it reads a player's evidence (PlayerEvidence —
 * his season so far, his recent starts, his past seasons, his price) and one
 * match's outlook (FixtureOutlook — the Fixture Forecast's goals expected
 * each way), and the fitted settings (pointsModelParams.ts). The app builds
 * the evidence from its own data (pointsModelLive.ts); the backtest
 * (client/scripts/pointsModel/) builds the same evidence from the club
 * records of past seasons and runs this same code, so the figures it proves
 * are the figures the app shows.
 *
 * The shape of it, from the historic analysis behind it (README):
 *  - Playing time first: a chance of starting (from his recent starts, the
 *    last match counting most, his season and last season, and his price),
 *    then how long starters and substitutes of his position play. Every
 *    other part is worked out for each way the match can go for him
 *    (starts and plays 60+, starts and comes off early, comes on, doesn't
 *    play), so a part with a threshold (clean sheet, defensive
 *    contribution, every 2 conceded, every 3 saves) sees the minutes it
 *    actually needs.
 *  - Goals and assists: his rate per 90, a blend of expected and actual
 *    (xG/goals, xA/assists), this season and past seasons, pulled toward
 *    what a player of his position and price usually manages until his own
 *    minutes outweigh it; then scaled by how many goals his club is
 *    expected to score in THIS match against its usual.
 *  - Clean sheets and goals conceded: the club's, from the goals the
 *    opponent is expected to score (a defender's clean sheets are his
 *    club's: r = 0.91 historically).
 *  - Saves: his rate, scaled by how many the opponent is expected to score.
 *  - Defensive contribution: his own rate (the most repeatable stat in the
 *    game, barely moved by the opponent), and the chance of reaching the
 *    threshold in the minutes he plays.
 *  - Bonus: his rate, scaled by his club's chance of winning (about 70% of
 *    bonus comes in wins).
 *  - Cards, own goals and (with penalty evidence) penalties.
 */

export interface ScoringRules {
  goal: Record<Position, number>;
  assist: number;
  cleanSheet: Record<Position, number>;
  /** Per 2 goals conceded (negative), GK and DEF only. */
  goalsConcededPer2: Record<Position, number>;
  /** Per 3 saves, GK only. */
  savesPer3: number;
  penaltySave: number;
  penaltyMiss: number;
  yellowCard: number;
  redCard: number;
  ownGoal: number;
  /** Points for reaching the defensive-contribution threshold; 0 in seasons before it existed. */
  defensiveContribution: number;
  /** Actions needed in one match (CBIT for DEF, CBIRT for MID/FWD); null where the rule doesn't apply. */
  defensiveContributionThreshold: Record<Position, number | null>;
}

/** FPL's 2026/27 scoring rules (the same as 2025/26's). */
export const SCORING_RULES: ScoringRules = {
  goal: { GKP: 10, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GKP: 4, DEF: 4, MID: 1, FWD: 0 },
  goalsConcededPer2: { GKP: -1, DEF: -1, MID: 0, FWD: 0 },
  savesPer3: 1,
  penaltySave: 5,
  penaltyMiss: -2,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  defensiveContribution: 2,
  defensiveContributionThreshold: { GKP: null, DEF: 10, MID: 12, FWD: 12 },
};

/** One season's figures for a player (this season so far, or a past one). */
export interface SeasonTotals {
  minutes: number;
  /** Null where the record has no starts (FPL has them from 2022/23). */
  starts: number | null;
  goals: number;
  assists: number;
  xG: number | null;
  /** The minutes his xG covers, where that's fewer than all of them (FPL's xG began part-way through 2022/23); all of them when absent. */
  xGMinutes?: number;
  xA: number | null;
  /** Defensive contributions; null where FPL didn't record them (before 2025/26). */
  dc: number | null;
  saves: number | null;
  bonus: number;
  yellowCards: number | null;
  /** Penalties he took and scored: from the optional second source (Understat) only, null without it. */
  penaltiesTaken: number | null;
  penaltyGoals: number | null;
}

export interface PastSeason extends SeasonTotals {
  /** 1 = the last completed season. */
  seasonsAgo: number;
}

/** One of his club's matches this season that he was registered for (<season_matches>). */
export type RecentMatch = SeasonMatch;

export interface PlayerEvidence {
  position: Position;
  /** £m. */
  price: number;
  /** This season so far; null before he has a match this season. */
  current: SeasonTotals | null;
  /** This season's matches he was registered for, oldest first (empty before his first). */
  matches: RecentMatch[];
  /** Up to the last three completed seasons he played in the Premier League. */
  past: PastSeason[];
  /** First choice on penalties; null when unknown. Only used with penalty evidence (see separatesPenalties). */
  penaltyTaker: boolean | null;
  /** Chance of being available, 0–1 (FPL's chance of playing; 1 with no news). */
  availability: number;
  /**
   * <transfer_signal>: FPL managers' transfers of him in the run-up to this
   * match's deadline (in, out) and his owners now, after them. Null when
   * unknown: the chance of starting then goes without it.
   */
  transfers: TransferWindow | null;
}

export interface TransferWindow {
  in: number;
  out: number;
  owners: number;
}

/** One match from his club's side, from the Fixture Forecast's club ratings. */
export interface FixtureOutlook {
  /** Goals his club is expected to score / concede in this match. */
  goalsFor: number;
  goalsAgainst: number;
  /** The same against an average opponent, home and away averaged: the club's usual. */
  baseFor: number;
  baseAgainst: number;
  /** His club's chance of winning this match, and against an average opponent. */
  win: number;
  baseWin: number;
}

export interface StartModel {
  intercept: number;
  lastStarted: number;
  recentShare: number;
  seasonShare: number;
  lastSeasonShare: number;
  /** Added when he has no match this season yet. */
  noMatches: number;
  /** Added when there's no last-season start share. */
  noLastSeason: number;
  price: number;
  /** Added in his first, and second, match back after missing RETURN_AFTER_MISSED or more in a row (<return_from_absence>). */
  returnFirst: number;
  returnSecond: number;
  /** × managers' net selling of him before the deadline (sellOff), and again × that × his recent start share (a regular being sold says more than a squad player). */
  sellOff: number;
  sellOffByRecent: number;
}

/** A per-90 prior: base + perPrice × price (never below 0). */
export interface PricePrior {
  base: number;
  perPrice: number;
}

export interface PositionParams {
  start: StartModel;
  /** Of his starts, the share lasting 60+ minutes, and the average minutes of those and of the shorter ones. */
  sixtyGivenStart: number;
  minutesLongStart: number;
  minutesShortStart: number;
  /** How often a player of the position who doesn't start comes on, and for how long. */
  subRate: number;
  minutesSub: number;
  goalPrior: PricePrior;
  assistPrior: PricePrior;
  bonusPrior: PricePrior;
  /** Per 90. */
  savesPrior: number;
  dcPrior: number;
  yellowPrior: number;
  redPer90: number;
  ownGoalPer90: number;
  penaltySavePer90: number;
  /** Bonus scaling: 1 + bonusWin × (win chance − usual win chance). */
  bonusWin: number;
  /** Defensive actions' variance ÷ mean in one match (1 = Poisson). */
  dcDispersion: number;
}

export interface ModelParams {
  byPosition: Record<Position, PositionParams>;
  /** Share of expected (xG, xA) vs actual (goals, assists) in his scoring rates. */
  goalXgWeight: number;
  assistXaWeight: number;
  /** How much a past season counts against this one, per season back. */
  seasonDecay: number;
  /** The prior's weight, in 90s of his own minutes. */
  goalShrink: number;
  assistShrink: number;
  bonusShrink: number;
  savesShrink: number;
  dcShrink: number;
  yellowShrink: number;
  /** The position sub rate's weight, in matches he didn't start. */
  subShrink: number;
  /** The position's share of starts lasting 60+, and minutes in them: their weight against his own, in starts. */
  startMinutesShrink: number;
  /** His goals and assists scale with (club goals expected ÷ usual) ^ this. */
  attackExponent: number;
  /** His saves scale with (goals expected against ÷ usual) ^ this. */
  savesExponent: number;
  /** The forecast's goals against, scaled for clean sheets and goals conceded. */
  concedeScale: number;
  penalty: {
    /** Penalties a club takes per match, the share scored, and what one is worth in FPL's xG. */
    perClubMatch: number;
    conversion: number;
    xG: number;
  };
}

export interface ModelBreakdown {
  appearance: number;
  /** Penalties included. */
  goals: number;
  assists: number;
  cleanSheet: number;
  /** ≤ 0. */
  goalsConceded: number;
  /** Penalty saves included. GK only. */
  saves: number;
  defensiveContribution: number;
  bonus: number;
  /** Yellow and red cards, own goals and missed penalties: ≤ 0. */
  cards: number;
  total: number;
  /** His chance of starting, and the minutes he's expected to play. */
  startChance: number;
  expectedMinutes: number;
  /** What the figure leans on in place of his own record ("no Premier League minutes: price and position"), for the hover. */
  notes: string[];
}

// ---------- the match ----------

/** The chance the side expecting `goalsFor` beats the side expecting `goalsAgainst`, both Poisson (as the Fixture Forecast treats goals). */
function winChance(goalsFor: number, goalsAgainst: number): number {
  const MAX = 10;
  const pmf = (l: number) => {
    const out: number[] = [];
    let p = Math.exp(-l);
    for (let k = 0; k <= MAX; k++) {
      out.push(p);
      p = (p * l) / (k + 1);
    }
    return out;
  };
  const ours = pmf(goalsFor);
  const theirs = pmf(goalsAgainst);
  let win = 0;
  let covered = 0;
  for (let a = 0; a <= MAX; a++) {
    for (let b = 0; b <= MAX; b++) {
      covered += ours[a] * theirs[b];
      if (a > b) win += ours[a] * theirs[b];
    }
  }
  return covered > 0 ? win / covered : 0;
}

/**
 * One match's outlook for `club` against `opponent` (stable club codes),
 * from the Fixture Forecast's club ratings (<fixture_forecast>), the same
 * ratings the Team Profile shows: null when either club has none.
 */
export function fixtureOutlook(ratings: ClubRatings, club: number, opponent: number, home: boolean): FixtureOutlook | null {
  const att = ratings.attack.get(club);
  const def = ratings.defence.get(club);
  const oppAtt = ratings.attack.get(opponent);
  const oppDef = ratings.defence.get(opponent);
  if (att === undefined || def === undefined || oppAtt === undefined || oppDef === undefined) return null;
  const goalsFor = (home ? ratings.homeGoals : ratings.awayGoals) * att * oppDef;
  const goalsAgainst = (home ? ratings.awayGoals : ratings.homeGoals) * oppAtt * def;
  // Against an average opponent (attack and defence 1.0), home and away averaged.
  const homeFor = ratings.homeGoals * att;
  const homeAgainst = ratings.awayGoals * def;
  const awayFor = ratings.awayGoals * att;
  const awayAgainst = ratings.homeGoals * def;
  return {
    goalsFor,
    goalsAgainst,
    baseFor: (homeFor + awayFor) / 2,
    baseAgainst: (homeAgainst + awayAgainst) / 2,
    win: winChance(goalsFor, goalsAgainst),
    baseWin: (winChance(homeFor, homeAgainst) + winChance(awayFor, awayAgainst)) / 2,
  };
}

// ---------- distributions ----------

/** ln Γ(x), Lanczos approximation (x > 0). */
function logGamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** ln Γ(k + 1) = ln k! for a whole number k, worked out once each (logGamma's own value, so every figure is unchanged). */
const LOG_FACTORIALS: number[] = [];
function logFactorial(k: number): number {
  return (LOG_FACTORIALS[k] ??= logGamma(k + 1));
}

/**
 * P(X = k) for k = 0, 1, 2, … in turn, for a count with mean `mean` and
 * variance `mean × dispersion`: Poisson at dispersion 1, negative binomial
 * above it. The parts that don't depend on k are worked out once; each
 * term is the same expression, in the same order, as working it out alone.
 */
function countPmfs(mean: number, dispersion: number): (k: number) => number {
  if (mean <= 0) return (k) => (k === 0 ? 1 : 0);
  if (dispersion <= 1.0001) {
    const logMean = Math.log(mean);
    return (k) => Math.exp(-mean + k * logMean - logFactorial(k));
  }
  const r = mean / (dispersion - 1);
  const p = r / (r + mean);
  const logGammaR = logGamma(r);
  const rLogP = r * Math.log(p);
  const logQ = Math.log(1 - p);
  return (k) => Math.exp(logGamma(k + r) - logGammaR - logFactorial(k) + rLogP + k * logQ);
}

/** P(X ≥ threshold). */
export function chanceAtLeast(threshold: number, mean: number, dispersion = 1): number {
  if (mean <= 0) return 0;
  const pmf = countPmfs(mean, dispersion);
  let below = 0;
  for (let k = 0; k < threshold; k++) below += pmf(k);
  return Math.min(1, Math.max(0, 1 - below));
}

/** E[floor(X / per)] for a Poisson X: what "a point for every `per`" pays. */
export function expectedEvery(per: number, mean: number): number {
  if (mean <= 0) return 0;
  // Tail sum: E[floor(X/per)] = Σ_{j≥1} P(X ≥ j·per). Each P(X ≥ j·per) is
  // chanceAtLeast's: one running total of P(X = k) from k = 0, carried on
  // from j to j + 1 rather than restarted — the same additions in the same
  // order, so the same figure.
  const pmf = countPmfs(mean, 1);
  let total = 0;
  let below = 0;
  let k = 0;
  for (let j = 1; j < 60; j++) {
    for (; k < j * per; k++) below += pmf(k);
    const p = Math.min(1, Math.max(0, 1 - below));
    total += p;
    if (p < 1e-7) break;
  }
  return total;
}

const logistic = (z: number) => 1 / (1 + Math.exp(-z));

// ---------- rates ----------

/** Seasons as (totals, weight): this season 1, a past one decay^seasonsAgo. */
function weightedSeasons(e: PlayerEvidence, decay: number): { t: SeasonTotals; w: number }[] {
  const out: { t: SeasonTotals; w: number }[] = e.past.map((t) => ({ t, w: Math.pow(decay, t.seasonsAgo) }));
  if (e.current) out.push({ t: e.current, w: 1 });
  return out;
}

/**
 * A per-90 rate: his own amounts and minutes, seasons weighted, plus
 * `shrink` 90s of the prior. With few minutes the prior dominates; with a
 * full season or two, his own record does.
 */
function shrunkRate(seasons: { t: SeasonTotals; w: number }[], amount: (t: SeasonTotals) => { value: number; minutes: number } | null, prior: number, shrink: number): number {
  let num = shrink * prior;
  let den = shrink;
  for (const { t, w } of seasons) {
    const a = amount(t);
    if (a === null || a.minutes <= 0) continue;
    num += w * a.value;
    den += (w * a.minutes) / 90;
  }
  return den > 0 ? num / den : prior;
}

const pricePrior = (p: PricePrior, price: number) => Math.max(0, p.base + p.perPrice * price);

/** Whether penalties are modelled on their own: every season in use carries penalty evidence and his penalty role is known. */
export function separatesPenalties(e: PlayerEvidence): boolean {
  const seasons = [...e.past, ...(e.current ? [e.current] : [])];
  return e.penaltyTaker !== null && seasons.length > 0 && seasons.every((s) => s.penaltiesTaken !== null && s.penaltyGoals !== null);
}

/** Goals per 90 (expected and actual blended), penalties left out when they're modelled on their own. */
function goalAmount(t: SeasonTotals, xgWeight: number, penalties: boolean, penaltyXg: number): { value: number; minutes: number } {
  const pens = penalties ? (t.penaltiesTaken ?? 0) : 0;
  const penGoals = penalties ? (t.penaltyGoals ?? 0) : 0;
  const goals = Math.max(0, t.goals - penGoals);
  if (t.xG === null) return { value: goals, minutes: t.minutes };
  const xgMinutes = t.xGMinutes ?? t.minutes;
  // xG over the whole season: what it covers, scaled to all his minutes (its penalties first taken out).
  const xg = xgMinutes > 0 ? (Math.max(0, t.xG - pens * penaltyXg) * t.minutes) / xgMinutes : goals;
  return { value: xgWeight * xg + (1 - xgWeight) * goals, minutes: t.minutes };
}

function assistAmount(t: SeasonTotals, xaWeight: number): { value: number; minutes: number } {
  if (t.xA === null) return { value: t.assists, minutes: t.minutes };
  const xgMinutes = t.xGMinutes ?? t.minutes;
  const xa = xgMinutes > 0 ? (t.xA * t.minutes) / xgMinutes : t.assists;
  return { value: xaWeight * xa + (1 - xaWeight) * t.assists, minutes: t.minutes };
}

// ---------- playing time ----------

const RECENT_MATCHES = 6;
const RECENT_DECAY = 0.75;
/** Matches missed in a row (0 minutes) before he plays again for it to count as a return (<return_from_absence>). */
const RETURN_AFTER_MISSED = 3;
/** Owners added to both sides of sellOff's ratio, so a few transfers of a barely-owned player don't read as a stampede (<transfer_signal>). */
export const SELL_OFF_SMOOTHING = 10000;

export interface StartFeatures {
  hasMatches: boolean;
  lastStarted: number;
  recentShare: number;
  seasonShare: number;
  lastSeasonShare: number | null;
  price: number;
  /** 1 in his first (second) match back from an absence, else 0. */
  returnFirst: number;
  returnSecond: number;
  /** sellOff of his transfers; 0 when they're unknown. */
  sellOff: number;
}

/**
 * <return_from_absence>: whether he's just come back from missing
 * RETURN_AFTER_MISSED or more matches in a row (injured, ill, dropped):
 * the matches he has played since (1 or 2) and how many he missed; null
 * otherwise. A player back from a month out has a low share of recent
 * starts, but he starts more often than that share says — the fit adds it
 * back.
 */
export function returnFromAbsence(e: PlayerEvidence): { matchesBack: 1 | 2; missed: number } | null {
  const ms = e.matches;
  const missedBefore = (i: number) => {
    let k = 0;
    for (let j = i - 1; j >= 0 && ms[j].minutes === 0; j--) k++;
    return k;
  };
  const n = ms.length;
  if (n >= 1 && ms[n - 1].minutes > 0) {
    const missed = missedBefore(n - 1);
    if (missed >= RETURN_AFTER_MISSED) return { matchesBack: 1, missed };
    if (n >= 2 && ms[n - 2].minutes > 0) {
      const missed2 = missedBefore(n - 2);
      if (missed2 >= RETURN_AFTER_MISSED) return { matchesBack: 2, missed: missed2 };
    }
  }
  return null;
}

/**
 * <transfer_signal>: managers' net selling of him before the deadline —
 * transfers out beyond transfers in — as a share of the managers who owned
 * him, on a log scale (−0.1 ≈ a net tenth sold him): ln((owners now + s) ÷
 * (owners before + s)), s = SELL_OFF_SMOOTHING, and 0 when more bought
 * him than sold him (buying isn't read: the owner's decision, 2026-10-25,
 * that the indicator is a lot of transfers out). Managers sell on team
 * news (an injury, a dropped player, a press conference) before any match
 * is played, so it carries news the model's match record can't. Owners
 * only scale it: 10,000 sales of a player 2m own is nothing, of one 20,000
 * own a stampede; how many own him plays no other part.
 */
export function sellOff(t: TransferWindow): number {
  const before = Math.max(0, t.owners - t.in + t.out);
  return Math.min(0, Math.log((Math.max(0, t.owners) + SELL_OFF_SMOOTHING) / (before + SELL_OFF_SMOOTHING)));
}

/** What the chance of starting is worked out from (exported for fitting). */
export function startFeatures(e: PlayerEvidence): StartFeatures {
  const ms = e.matches;
  const recent = ms.slice(-RECENT_MATCHES);
  let num = 0;
  let den = 0;
  recent.forEach((m, i) => {
    const w = Math.pow(RECENT_DECAY, recent.length - 1 - i);
    num += w * (m.started ? 1 : 0);
    den += w;
  });
  const last = e.past.find((p) => p.seasonsAgo === 1);
  const back = returnFromAbsence(e);
  return {
    hasMatches: ms.length > 0,
    lastStarted: ms.length > 0 && ms[ms.length - 1].started ? 1 : 0,
    recentShare: den > 0 ? num / den : 0,
    seasonShare: ms.length > 0 ? ms.filter((m) => m.started).length / ms.length : 0,
    lastSeasonShare: last && last.starts !== null ? Math.min(1, last.starts / 38) : null,
    price: e.price,
    returnFirst: back?.matchesBack === 1 ? 1 : 0,
    returnSecond: back?.matchesBack === 2 ? 1 : 0,
    sellOff: e.transfers ? sellOff(e.transfers) : 0,
  };
}

/** The chance of starting before availability: a logistic of the start features. */
export function startLogit(f: StartFeatures, s: StartModel): number {
  let z = s.intercept + s.price * f.price;
  if (f.hasMatches) z += s.lastStarted * f.lastStarted + s.recentShare * f.recentShare + s.seasonShare * f.seasonShare;
  else z += s.noMatches;
  z += f.lastSeasonShare === null ? s.noLastSeason : s.lastSeasonShare * f.lastSeasonShare;
  z += s.returnFirst * f.returnFirst + s.returnSecond * f.returnSecond;
  z += (s.sellOff + s.sellOffByRecent * f.recentShare) * f.sellOff;
  return z;
}

interface Scenario {
  probability: number;
  minutes: number;
  /** Starts and plays 60+: what clean sheets and the 2-point appearance need. */
  sixtyPlus: boolean;
}

/**
 * How long he plays when he starts: his own starts this season (the share
 * lasting 60+, and his minutes in those), pulled toward his position's
 * figures — a forward taken off at 65 every week gets less of every part
 * than one who plays the 90.
 */
export function startMinutes(e: PlayerEvidence, pp: PositionParams, params: ModelParams): { sixtyShare: number; longMinutes: number } {
  const starts = e.matches.filter((m) => m.started);
  const long = starts.filter((m) => m.minutes >= 60);
  const k = params.startMinutesShrink;
  return {
    sixtyShare: (long.length + k * pp.sixtyGivenStart) / (starts.length + k),
    longMinutes: (long.reduce((s, m) => s + m.minutes, 0) + k * pp.minutesLongStart) / (long.length + k),
  };
}

function playingScenarios(e: PlayerEvidence, pp: PositionParams, params: ModelParams): { scenarios: Scenario[]; startChance: number } {
  const startChance = logistic(startLogit(startFeatures(e), pp.start)) * e.availability;
  const { sixtyShare, longMinutes } = startMinutes(e, pp, params);
  const notStarted = e.matches.filter((m) => !m.started);
  const cameOn = notStarted.filter((m) => m.minutes > 0).length;
  const subRate = ((cameOn + params.subShrink * pp.subRate) / (notStarted.length + params.subShrink)) * e.availability;
  const sub = (1 - startChance) * subRate;
  return {
    startChance,
    scenarios: [
      { probability: startChance * sixtyShare, minutes: longMinutes, sixtyPlus: true },
      { probability: startChance * (1 - sixtyShare), minutes: pp.minutesShortStart, sixtyPlus: false },
      { probability: sub, minutes: pp.minutesSub, sixtyPlus: false },
    ],
  };
}

// ---------- the model ----------

/** Net selling the hover mentions (5% of his owners). */
const NOTABLE_SELL_OFF = 0.05;

/** His rates per 90, exported for the backtest's component checks. */
export function playerRates(e: PlayerEvidence, params: ModelParams) {
  const pp = params.byPosition[e.position];
  const seasons = weightedSeasons(e, params.seasonDecay);
  const pens = separatesPenalties(e);
  return {
    goals: shrunkRate(seasons, (t) => goalAmount(t, params.goalXgWeight, pens, params.penalty.xG), pricePrior(pp.goalPrior, e.price), params.goalShrink),
    assists: shrunkRate(seasons, (t) => assistAmount(t, params.assistXaWeight), pricePrior(pp.assistPrior, e.price), params.assistShrink),
    bonus: shrunkRate(seasons, (t) => ({ value: t.bonus, minutes: t.minutes }), pricePrior(pp.bonusPrior, e.price), params.bonusShrink),
    saves: shrunkRate(seasons, (t) => (t.saves === null ? null : { value: t.saves, minutes: t.minutes }), pp.savesPrior, params.savesShrink),
    dc: shrunkRate(seasons, (t) => (t.dc === null ? null : { value: t.dc, minutes: t.minutes }), pp.dcPrior, params.dcShrink),
    yellow: shrunkRate(seasons, (t) => (t.yellowCards === null ? null : { value: t.yellowCards, minutes: t.minutes }), pp.yellowPrior, params.yellowShrink),
    penalties: pens,
  };
}

/** One player's expected points for one match. */
export function predictMatch(e: PlayerEvidence, outlook: FixtureOutlook, params: ModelParams, rules: ScoringRules = SCORING_RULES): ModelBreakdown {
  const pos = e.position;
  const pp = params.byPosition[pos];
  const rates = playerRates(e, params);
  const { scenarios, startChance } = playingScenarios(e, pp, params);
  const expectedMinutes = scenarios.reduce((s, x) => s + x.probability * x.minutes, 0);
  const share = expectedMinutes / 90;

  const attack = outlook.baseFor > 0 ? Math.pow(outlook.goalsFor / outlook.baseFor, params.attackExponent) : 1;
  const concede = outlook.baseAgainst > 0 ? outlook.goalsAgainst / outlook.baseAgainst : 1;
  const against = outlook.goalsAgainst * params.concedeScale;

  let appearance = 0;
  let cleanSheet = 0;
  let goalsConceded = 0;
  let saves = 0;
  let defensiveContribution = 0;
  const dcThreshold = rules.defensiveContributionThreshold[pos];
  for (const s of scenarios) {
    if (s.probability <= 0) continue;
    appearance += s.probability * (s.sixtyPlus ? 2 : 1);
    const conceded = (against * s.minutes) / 90;
    if (s.sixtyPlus) cleanSheet += s.probability * Math.exp(-conceded) * rules.cleanSheet[pos];
    if (rules.goalsConcededPer2[pos] !== 0) goalsConceded += s.probability * expectedEvery(2, conceded) * rules.goalsConcededPer2[pos];
    if (pos === "GKP") saves += s.probability * expectedEvery(3, (rates.saves * Math.pow(concede, params.savesExponent) * s.minutes) / 90) * rules.savesPer3;
    if (dcThreshold !== null && rules.defensiveContribution > 0) {
      defensiveContribution += s.probability * chanceAtLeast(dcThreshold, (rates.dc * s.minutes) / 90, pp.dcDispersion) * rules.defensiveContribution;
    }
  }
  if (pos === "GKP") saves += pp.penaltySavePer90 * share * rules.penaltySave;

  let goals = rates.goals * attack * share * rules.goal[pos];
  const assists = rates.assists * attack * share * rules.assist;
  let cards = (rates.yellow * rules.yellowCard + pp.redPer90 * rules.redCard + pp.ownGoalPer90 * rules.ownGoal) * share;
  if (rates.penalties && e.penaltyTaker) {
    const taken = params.penalty.perClubMatch * attack * share;
    goals += taken * params.penalty.conversion * rules.goal[pos];
    cards += taken * (1 - params.penalty.conversion) * rules.penaltyMiss;
  }
  const bonus = rates.bonus * share * Math.max(0, 1 + pp.bonusWin * (outlook.win - outlook.baseWin));

  const notes: string[] = [];
  const minutesOnRecord = (e.current?.minutes ?? 0) + e.past.reduce((s, p) => s + p.minutes, 0);
  // Where his own minutes and the prior weigh the same in his scoring rate (goalShrink 90s).
  const evenMinutes = Math.round(params.goalShrink) * 90;
  if (minutesOnRecord === 0) notes.push("no Premier League minutes on record: his position and price stand in");
  else if (minutesOnRecord < evenMinutes) notes.push(`under ${evenMinutes} Premier League minutes on record: his position and price weigh in as much as his own`);
  if (e.availability < 1) notes.push(`${Math.round(e.availability * 100)}% chance of being available`);
  const back = returnFromAbsence(e);
  if (back) notes.push(`${back.matchesBack === 1 ? "first" : "second"} match back after missing ${back.missed}: allowed for in his chance of starting`);
  if (e.transfers) {
    const sold = 1 - Math.exp(sellOff(e.transfers));
    if (sold >= NOTABLE_SELL_OFF) notes.push(`managers selling him before the deadline (net ${Math.round(sold * 100)}% of his owners): allowed for in his chance of starting`);
  }

  const total = appearance + goals + assists + cleanSheet + goalsConceded + saves + defensiveContribution + bonus + cards;
  return { appearance, goals, assists, cleanSheet, goalsConceded, saves, defensiveContribution, bonus, cards, total, startChance, expectedMinutes, notes };
}
