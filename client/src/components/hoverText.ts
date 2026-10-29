import type { Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";
import type { ModelBreakdown } from "../metrics/pointsModel";
import type { GameweekExpectation, PointsSource } from "../metrics/gameweekExpectations";
import type { FplBreakdown } from "../metrics/expectedPoints";
import { fmtDecimal, fmtPercent } from "../utils/format";

/**
 * <hover_text>: what a hover says, app-wide (the owner's pass, 2026-10-20).
 * A hover answers "what is this, for this player / club / match?" in one
 * line: the stat in plain words on a header, the figure's rank on a
 * coloured cell or tile, the actual opponent or breakdown on a match
 * figure. How to use the app (sort, drag, resize) and methodology live in
 * the User Guide and README, not in hovers.
 *
 * Every hover here is a short string built from figures the page already
 * has: nothing is fetched or ranked for it, and the rank phrases are cached,
 * so a table's thousands of cells share a few hundred strings.
 */

export const POSITION_PLURAL: Record<Position, string> = { GKP: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" };

/**
 * <stat_hover>: every figure the app shows says two things on hover (the
 * owner's rule, 2026-10-26): what the statistic is and measures (its
 * column's plain-words hint, the same line its header shows), then where
 * this figure ranks — a player's percentile within his position, a club's
 * place among the clubs. Where there's no rank, the second line says why
 * (under the minutes floor) or is left out (nothing to compare with).
 * One line each, joined here, so every surface reads the same way.
 */
export function statHover(definition: string | undefined, rank: string | undefined): string | undefined {
  if (!definition) return rank;
  if (!rank) return definition;
  const key = `${definition}\u0000${rank}`;
  let hint = statHoverCache.get(key);
  if (hint === undefined) {
    hint = `${definition}\n${rank}`;
    statHoverCache.set(key, hint);
  }
  return hint;
}
const statHoverCache = new Map<string, string>();

const rankPhraseCache = new Map<string, string>();

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/**
 * A player's rank in words: his percentile within his position (the one
 * behind every tint, higher = better, <comparative_colouring>), then what
 * that means — "92nd percentile of midfielders: top 8%", "15th percentile
 * of forwards: bottom 15%", or around the middle where a cell has no tint.
 * `neutral`: a figure that's neither better nor worse (never coloured), so
 * the percentile is simply how high it is, with no top or bottom.
 * `among`: what he's ranked against, when that isn't his position's
 * figures of the same kind ("midfielders' per-match averages").
 * Undefined without a rank (under the floor, nobody to compare with).
 */
export function playerRankHint(
  percentile: number | null | undefined,
  position: Position,
  opts: { neutral?: boolean; among?: string } = {},
): string | undefined {
  return percentileHint(percentile, opts.among ?? POSITION_PLURAL[position], opts.neutral);
}

/** A percentile in words against any pool (`among`: "every club's upcoming fixtures"), as playerRankHint words a player's. */
export function percentileHint(percentile: number | null | undefined, among: string, neutral = false): string | undefined {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile)) return undefined;
  const p = Math.min(99, Math.max(1, Math.round(percentile)));
  const key = `${among}|${p}|${neutral ? 1 : 0}`;
  let hint = rankPhraseCache.get(key);
  if (hint === undefined) {
    const head = `${ordinal(p)} percentile of ${among}`;
    hint = neutral ? head : `${head}: ${p >= 60 ? `top ${100 - p}%` : p <= 40 ? `bottom ${p}%` : "around the middle"}`;
    rankPhraseCache.set(key, hint);
  }
  return hint;
}

/** Why a player's figure has no percentile: he's under the fixed floor for the view (<minutes_marker>). */
export function noPercentileHint(floorMinutes: number): string {
  return `No percentile: under the ${floorMinutes}-minute floor, a small sample`;
}

/**
 * A club's rank in words: "3rd of 20 clubs" (best first). `poolSize` is
 * how many clubs have a figure. The percentile counts half of any tie, so
 * this is the tie's middle place, rounded. `neutral`: a figure that's
 * neither better nor worse, so "3rd highest of 20 clubs".
 */
export function clubRankHint(percentile: number | null | undefined, poolSize: number, opts: { neutral?: boolean } = {}): string | undefined {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile) || poolSize < 2) return undefined;
  const place = Math.min(poolSize, Math.max(1, Math.round(poolSize + 0.5 - (percentile * poolSize) / 100)));
  return `${ordinal(place)}${opts.neutral ? " highest" : ""} of ${poolSize} clubs`;
}

/** One upcoming match: "BOU at home · FPL difficulty 2/5". */
export function fixtureHint(f: UpcomingFixture): string {
  return `${f.opponentShortName} ${f.isHome ? "at home" : "away"} · FPL difficulty ${f.difficulty}/5`;
}

/** The average beside a row of fixture chips. */
export function averageFixtureHint(average: number, count: number): string {
  return `Average FPL difficulty of these ${count} match${count === 1 ? "" : "es"}: ${fmtDecimal(average, 1)} (1 easiest, 5 hardest)`;
}

/** "v BOU (H)", or "" without a match. */
export function versusText(f: UpcomingFixture | undefined): string {
  return f ? ` v ${f.opponentShortName} (${f.isHome ? "H" : "A"})` : "";
}

/**
 * The model's figure for one match, in parts: "Scoutline's model v BOU (H):
 * 5.8 pts = appearance 1.9 + goals 1.2 + … − goals conceded 0.4 − cards
 * 0.1", then his chance of starting and what the figure leans on. The
 * model's workings are in the README, not here.
 */
export function modelBreakdownHint(b: ModelBreakdown, fixture: UpcomingFixture | undefined, captain = false): string {
  const scale = captain ? 2 : 1;
  const parts: [string, number][] = [
    ["appearance", b.appearance],
    ["goals", b.goals],
    ["assists", b.assists],
    ["clean sheet", b.cleanSheet],
    ["saves", b.saves],
    ["defensive contributions", b.defensiveContribution],
    ["bonus", b.bonus],
  ];
  const shown = parts.filter(([, v]) => v * scale >= 0.05).map(([name, v]) => `${name} ${fmtDecimal(v * scale, 1)}`);
  const losses: [string, number][] = [
    ["goals conceded", b.goalsConceded],
    ["cards", b.cards],
  ];
  const lost = losses
    .filter(([, v]) => v * scale <= -0.05)
    .map(([name, v]) => ` − ${name} ${fmtDecimal(-v * scale, 1)}`)
    .join("");
  const head = `Scoutline's model${versusText(fixture)}${captain ? " (captain ×2)" : ""}: ${fmtDecimal(b.total * scale, 1)} pts`;
  const sum = shown.length > 0 ? ` = ${shown.join(" + ")}${lost}` : "";
  const playing = `. ${fmtPercent(b.startChance * 100, 0)} chance of starting, about ${Math.round(b.expectedMinutes)} minutes expected`;
  const notes = b.notes.length > 0 ? `; ${b.notes.join("; ")}` : "";
  return `${head}${sum}${playing}${notes}`;
}

/** " v BUR (H) and v WOL (A)": a gameweek's matches (two in a double). */
export function gameweekVersusText(fixtures: readonly UpcomingFixture[]): string {
  return fixtures.map(versusText).join(" and");
}

/** Hover for a figure with no gameweek to be for: a blank, or none left this season (null). */
function gameweekGapHint(g: GameweekExpectation | null): string | undefined {
  if (g === null) return "No gameweek left to pick for this season";
  if (g.fixtures.length === 0) return `No match in GW${g.eventId}`;
  return undefined;
}

/**
 * FPL Official's figure for one match, in parts (<fpl_official>): "FPL
 * figures v BUR (H): 3.4 pts. Season 3.9 a match (goals and assists partly
 * as xG and xA), counting 80%; form 1.3 (FPL's own expected points),
 * counting 20%; +10% for FPL difficulty 2". The difficulty part is left out
 * at 3 (no change), the chance of playing at 100%.
 */
export function fplBreakdownHint(b: FplBreakdown, fixture: UpcomingFixture | undefined, captain = false): string {
  const head = `FPL figures${versusText(fixture)}${captain ? " (captain ×2)" : ""}: ${fmtDecimal(b.total * (captain ? 2 : 1), 1)} pts`;
  const parts =
    b.seasonRate === null
      ? [`FPL's own expected points (his form) alone: no season record of his to go on yet`]
      : [
          `Season ${fmtDecimal(b.seasonRate, 1)} a match (goals and assists partly as xG and xA), counting ${fmtPercent((1 - b.formShare) * 100, 0)}`,
          `form ${fmtDecimal(b.epNext, 1)} (FPL's own expected points), counting ${fmtPercent(b.formShare * 100, 0)}`,
        ];
  const change = Math.round((b.multiplier - 1) * 100);
  if (change !== 0 && fixture) parts.push(`${change > 0 ? "+" : "−"}${Math.abs(change)}% for FPL difficulty ${fixture.difficulty}`);
  if (b.availability < 1) parts.push(`${fmtPercent(b.availability * 100, 0)} chance of playing`);
  return `${head}. ${parts.join("; ")}`;
}

/** An FPL Official figure for one gameweek: each match's breakdown (fplBreakdownHint), one line each in a double. */
export function fplGameweekHint(g: GameweekExpectation | null, captain = false): string {
  const gap = gameweekGapHint(g);
  if (gap || g === null) return gap ?? "";
  if (g.fplBreakdowns === null) return `FPL has no expected points for him in GW${g.eventId}`;
  return g.fplBreakdowns.map((b, i) => fplBreakdownHint(b, g.fixtures[i], captain)).join("\n");
}

/** A Model Predicted figure for one gameweek: each match's breakdown (modelBreakdownHint), one line each in a double. */
export function modelGameweekHint(g: GameweekExpectation | null, captain = false): string {
  const gap = gameweekGapHint(g);
  if (gap || g === null) return gap ?? "";
  if (g.modelBreakdowns === null) return "Scoutline's model has no figure: it needs his availability news, his matches this season and both clubs' records, and one of them isn't there";
  return g.modelBreakdowns.map((b, i) => modelBreakdownHint(b, g.fixtures[i], captain)).join("\n");
}

/** <expected_minutes> for one gameweek: "About 78 minutes expected in GW9 v BUR (H): 88% chance of starting"; a double gives each match's on its own line. */
export function minutesGameweekHint(g: GameweekExpectation | null): string {
  const gap = gameweekGapHint(g);
  if (gap || g === null) return gap ?? "";
  if (g.modelBreakdowns === null || g.expectedMinutes === null) return "Scoutline's model has no figure: it needs his availability news, his matches this season and both clubs' records, and one of them isn't there";
  const head = `About ${Math.round(g.expectedMinutes)} minutes expected in GW${g.eventId}`;
  const [only] = g.modelBreakdowns;
  if (g.modelBreakdowns.length === 1) return `${head}${versusText(g.fixtures[0])}: ${fmtPercent(only.startChance * 100, 0)} chance of starting`;
  return [head, ...g.modelBreakdowns.map((b, i) => `${versusText(g.fixtures[i]).trim()}: about ${Math.round(b.expectedMinutes)}, ${fmtPercent(b.startChance * 100, 0)} chance of starting`)].join("\n");
}

/** A stat column's header hover: what it is, then the one thing about it worth knowing here. */
export function columnHint(
  label: string,
  opts: { hint?: string; lowerIsBetter?: boolean; liveFigure?: boolean; source?: string },
): string {
  const lines = [opts.hint ? `${label}: ${opts.hint}` : label];
  if (opts.source) lines[0] = `${opts.source} · ${lines[0]}`;
  const notes = [opts.lowerIsBetter && "Lower is better.", opts.liveFigure && "Today's figure, whatever the Data View."].filter(Boolean);
  if (notes.length > 0) lines.push(notes.join(" "));
  return lines.join("\n");
}

type ColumnLike = { key: string; label: string; higherIsBetter?: boolean; varies?: boolean };

/**
 * A player column's header hover, and the first line of each of its
 * figures' (<stat_hover>): FPL's meaning, or a second source's when
 * `sourceLabel` names it. `label` overrides the column's own (a profile
 * tile spelled out longer).
 */
export function playerColumnHint(c: ColumnLike, opts: { sourceLabel?: string; label?: string } = {}): string {
  return columnHint(opts.label ?? c.label, {
    hint: opts.sourceLabel ? UNDERSTAT_STAT_HINTS[c.key] : PLAYER_STAT_HINTS[c.key],
    source: opts.sourceLabel,
    lowerIsBetter: c.higherIsBetter === false,
    liveFigure: c.varies === false,
  });
}

/** A club column's header hover, and the first line of each of its figures' (<stat_hover>). */
export function clubColumnHint(c: ColumnLike, opts: { sourceLabel?: string; label?: string } = {}): string {
  return columnHint(opts.label ?? c.label, {
    hint: opts.sourceLabel ? (CLUB_UNDERSTAT_HINTS[c.key] ?? UNDERSTAT_STAT_HINTS[c.key]) : CLUB_STAT_HINTS[c.key],
    source: opts.sourceLabel,
    // "Lower is better" says nothing a league position doesn't.
    lowerIsBetter: c.higherIsBetter === false && c.key !== "leaguePosition",
  });
}

/**
 * Plain-words meaning of each player stat column (FPL's figures), by
 * column key. Short on purpose: one idea each, in FPL terms.
 */
export const PLAYER_STAT_HINTS: Record<string, string> = {
  totalPoints: "FPL points scored.",
  pointsPerGame: "FPL points per game played (games counted from his minutes).",
  goals: "Goals scored.",
  assists: "Assists, as FPL credits them.",
  cleanSheets: "Clean sheets FPL credited him with (60+ minutes, nothing conceded while he was on).",
  bonus: "Bonus points: the 1–3 extra points for a match's top BPS scores.",
  saves: "Saves made. Every 3 is an FPL point.",
  savesPerGame: "Saves per game played. Every 3 is an FPL point.",
  penaltiesSaved: "Penalties saved, 5 FPL points each.",
  goalsConceded: "Goals conceded while he was on the pitch. Coloured per game, since a total grows with minutes.",
  goalsConcededPerGame: "Goals conceded per game while he was on the pitch. Keepers and defenders lose a point per 2.",
  yellowCards: "Yellow cards, −1 point each. Coloured per game.",
  redCards: "Red cards, −3 points each. Coloured per game.",
  form: "FPL's form: his average points a match over the last 30 days.",
  xG: "Expected goals: how many goals his chances would usually bring.",
  xA: "Expected assists: how many assists the chances he made would usually bring.",
  xGI: "Expected goal involvements: xG + xA, his whole attacking threat.",
  xGPerGame: "Expected goals per game played.",
  xAPerGame: "Expected assists per game played.",
  xGIPerGame: "xG + xA per game played.",
  goalsMinusXG: "Goals minus xG. Above 0: scoring more than his chances suggest. Below 0: fewer.",
  assistsMinusXA: "Assists minus xA. Above 0: more assists than his chances made suggest. Below 0: fewer.",
  goalInvolvementsMinusXGI: "Goals plus assists minus xGI. Above 0: more goal involvements than his chances suggest.",
  xGC: "Expected goals conceded while he was on the pitch. Coloured per game.",
  xGCPerGame: "Expected goals conceded per game while he was on the pitch.",
  price: "FPL price today.",
  pointsPerMillion: "FPL points per £1m of today's price.",
  xGPerMillion: "xG per £1m of today's price.",
  xAPerMillion: "xA per £1m of today's price.",
  xGIPerMillion: "xG + xA per £1m of today's price.",
  minutes: "Minutes played.",
  starts: "Matches started.",
  bps: "Bonus Points System score: FPL's match rating that decides bonus points.",
  ictIndex: "FPL's Influence, Creativity and Threat scores combined.",
  influence: "FPL's score for his impact on results.",
  creativity: "FPL's score for the chances he creates for others.",
  threat: "FPL's score for his own goal threat.",
  defensiveContributions: "Clearances, blocks, interceptions and tackles (plus recoveries for midfielders and forwards). 10+ for a defender, 12+ otherwise, earns 2 points in a match.",
  defensiveContributionsPerGame: "Defensive contributions per game played.",
  defensiveRewardPerGame: "Clean-sheet points for his position plus bonus, per game played.",
  tackles: "Tackles. FPL tracks them from 2025/26.",
  clearancesBlocksInterceptions: "Clearances, blocks and interceptions. FPL tracks them from 2025/26.",
  recoveries: "Ball recoveries. FPL tracks them from 2025/26.",
  penaltiesOrder: "His place on his club's penalty list (1 = first choice).",
  directFreekicksOrder: "His place on his club's direct free-kick list (1 = first choice).",
  cornersOrder: "His place on his club's corner and indirect free-kick list (1 = first choice).",
  ownership: "Share of FPL managers who own him.",
  // Profile-only figures (no Explorer column).
  minutesPerGoal: "Minutes played per goal scored.",
};

/** Plain-words meaning of each club stat column (FPL's figures), by column key. */
export const CLUB_STAT_HINTS: Record<string, string> = {
  leaguePosition: "Place in the league table.",
  leaguePoints: "League points: 3 for a win, 1 for a draw.",
  played: "Matches played.",
  wins: "Matches won.",
  draws: "Matches drawn.",
  losses: "Matches lost.",
  goalsFor: "Goals scored, own goals in their favour included.",
  goalsAgainst: "Goals conceded.",
  goalDifference: "Goals scored minus goals conceded.",
  cleanSheets: "Matches without conceding.",
  points: "FPL points scored by the club's players, whoever played for it then.",
  goals: "Goals by the club's players. Own goals in their favour aren't included.",
  assists: "Assists by the club's players, as FPL credits them.",
  bonus: "Bonus points won by the club's players.",
  xG: "Expected goals: how many goals the club's chances would usually bring.",
  xA: "Expected assists across the club's players.",
  xGI: "xG + xA across the club's players.",
  xGC: "Expected goals conceded: how many goals the opponents' chances would usually bring.",
  defensiveContributions: "Defensive contributions by the club's players.",
  cleanSheetRate: "Share of matches without conceding.",
  goalsAgainstPerGame: "Goals conceded per match.",
  pointsPerGame: "FPL points scored by the club's players per match.",
  goalsPerGame: "Goals by the club's players per match, own goals in their favour left out.",
  bonusPerGame: "Bonus points won by the club's players per match.",
  xGPerGame: "xG per match.",
  xAPerGame: "xA per match.",
  xGCPerGame: "xGC per match.",
  defensiveContributionsPerGame: "Defensive contributions by the club's players per match.",
  xGD: "xG minus xGC: whether the club's chances outweigh its opponents'.",
  xGDPerGame: "xG minus xGC per match.",
  goalsMinusXG: "Goals (own goals in their favour left out) minus xG: finishing above (+) or below (−) the chances' quality.",
  assistsMinusXA: "Assists minus xA across the club's players.",
  goalsAgainstMinusXGC: "Goals conceded minus xGC: fewer (−) means conceding less than the opponents' chances would usually bring.",
};

/**
 * Understat's columns, by column key — its own figures, so its headers say
 * so (columnHint `source`). The same key on a club column means the same
 * thing for the club; CLUB_UNDERSTAT_HINTS has the few that differ.
 */
export const UNDERSTAT_STAT_HINTS: Record<string, string> = {
  xG: "Expected goals: how many goals the chances would usually bring.",
  xA: "Expected assists: how many assists the chances made would usually bring.",
  xGI: "xG + xA.",
  xGC: "Expected goals conceded: what the chances his club faced while he was on the pitch were worth. Coloured per game.",
  xGCPerGame: "Expected goals conceded per game, from the shots his club faced while he was on the pitch.",
  xGPerGame: "Expected goals per game played.",
  xAPerGame: "Expected assists per game played.",
  xGIPerGame: "xG + xA per game played.",
  xGPerMillion: "xG per £1m of today's FPL price.",
  xAPerMillion: "xA per £1m of today's FPL price.",
  xGIPerMillion: "xG + xA per £1m of today's FPL price.",
  assists: "Assists, as Understat records them.",
  minutes: "Minutes played, as Understat records them.",
  goalsMinusXG: "Goals minus xG. Above 0: scoring more than the chances suggest.",
  assistsMinusXA: "Assists minus xA. Above 0: more assists than the chances made suggest.",
  goalInvolvementsMinusXGI: "Goals plus assists minus xG + xA. Above 0: more goal involvements than the chances suggest.",
  "us.shots": "Shots taken.",
  "us.shotsPerGame": "Shots per game played.",
  "us.shotsOnTarget": "Shots on target (scored or saved).",
  "us.onTargetPct": "Share of shots on target.",
  "us.xGPerShot": "Average xG a shot: how good the chances are.",
  "us.conversionPct": "Share of shots scored.",
  "us.npGoals": "Goals, penalties left out.",
  "us.npxG": "xG, penalties left out.",
  "us.npxGPerGame": "Non-penalty xG per game played.",
  "us.npxGPerShot": "Average non-penalty xG a shot.",
  "us.npGoalsMinusNpxG": "Non-penalty goals minus non-penalty xG: finishing without penalties.",
  "us.woodwork": "Shots that hit the post or bar.",
  "us.blockedShots": "Shots blocked by a defender.",
  "us.blockedPct": "Share of shots blocked.",
  "us.headedShots": "Headed shots.",
  "us.headedGoals": "Headed goals.",
  "us.headedXG": "xG from headers.",
  "us.openPlayShots": "Shots from open play.",
  "us.openPlayXG": "xG from open play.",
  "us.openPlayGoals": "Goals from open play.",
  "us.setPieceShots": "Shots from corners and free kicks.",
  "us.setPieceXG": "xG from corners and free kicks.",
  "us.setPieceGoals": "Goals from corners and free kicks.",
  "us.cornerXG": "xG from corners.",
  "us.freeKickXG": "xG from direct free kicks.",
  "us.penaltiesTaken": "Penalties taken.",
  "us.penaltyXG": "xG from penalties.",
  "us.penaltyGoals": "Penalties scored.",
  "us.setPieceShare": "Share of non-penalty xG from set pieces: how much the threat leans on dead balls.",
  "us.assistedPct": "Share of shots set up by a teammate's pass.",
  "us.crossShots": "Shots straight from a cross.",
  "us.crossXG": "xG from shots straight from a cross.",
  "us.throughBallShots": "Shots straight from a through ball.",
  "us.throughBallXG": "xG from shots straight from a through ball.",
  "us.dribbleShots": "Shots straight after beating a man.",
  "us.reboundShots": "Shots from rebounds.",
  "us.reboundXG": "xG from rebounds.",
  "us.keyPasses": "Passes that led to a shot.",
  "us.keyPassesPerGame": "Passes that led to a shot, per game played.",
  "us.xAPerKeyPass": "Average xA a key pass: how good the chances made are.",
  "us.npxGI": "Non-penalty xG + xA.",
  "us.npxGIPerGame": "Non-penalty xG + xA per game played.",
  "us.xGChain": "xG of every attack he touched, shot and assist included.",
  "us.xGChainPerGame": "xGChain per game played.",
  "us.xGBuildup": "xG of attacks he helped build, leaving out the shot and the assist.",
  "us.xGBuildupPerGame": "xGBuildup per game played.",
  "us.appearances": "Matches played in.",
};

/** Understat club columns whose meaning differs from the player column with the same key. */
export const CLUB_UNDERSTAT_HINTS: Record<string, string> = {
  xGC: "Expected goals conceded: what the opponents' chances were worth.",
  "us.blockedShots": "The club's shots blocked by a defender.",
  "us.deep": "Passes completed within about 20 yards of the opponents' goal, crosses left out.",
  "us.shotsAgainst": "Shots faced.",
  "us.shotsOnTargetAgainst": "Shots on target faced.",
  "us.xGAPerShot": "Average xG of a shot faced: how good the chances allowed are.",
  "us.npxGA": "xG conceded, penalties left out.",
  "us.deepAllowed": "Passes the opponents completed within about 20 yards of the club's goal.",
  "us.openPlayXGA": "xG conceded from open play.",
  "us.openPlayGoalsAgainst": "Goals conceded from open play.",
  "us.setPieceXGA": "xG conceded from corners and free kicks.",
  "us.setPieceGoalsAgainst": "Goals conceded from corners and free kicks.",
  "us.blocksMade": "Opponents' shots blocked.",
  "us.woodworkAgainst": "Opponents' shots that hit the post or bar.",
  "us.crossShotsAgainst": "Opponents' shots straight from a cross.",
  "us.penaltiesConceded": "Penalties conceded.",
  "us.ppda": "Passes the opponents make per defensive action: lower means a harder press.",
  "us.oppPpda": "Passes the club makes per opponents' defensive action: lower means they're pressed harder.",
  "us.xGD": "xG minus xG conceded.",
  "us.npxGD": "Non-penalty xG minus non-penalty xG conceded.",
  "us.xPts": "Expected league points from the chances both sides had in each match.",
  "us.ptsMinusXPts": "League points minus expected points. Above 0: results better than the chances suggest.",
};

/**
 * <points_horizon>: an Exp. Pts figure added up over several gameweeks,
 * one line each: "Next 3 gameweeks: 11.9 pts\nGW9 v BRE (A): 3.9\nGW10 …".
 * A single gameweek keeps its own breakdown (fplGameweekHint /
 * modelGameweekHint).
 */
export function horizonHint(expectations: readonly GameweekExpectation[], horizon: number, source: PointsSource, total: number | null): string {
  const window = expectations.slice(0, horizon);
  if (window.length === 0) return "No gameweek left to pick for this season";
  if (window.length === 1) return source === "fpl" ? fplGameweekHint(window[0]) : modelGameweekHint(window[0]);
  const name = source === "fpl" ? "FPL figures" : "Scoutline's model";
  const head = total === null ? `${name}: no total, as a gameweek below has no figure` : `${name}, next ${window.length} gameweeks: ${fmtDecimal(total, 1)} pts`;
  const lines = window.map((g) => {
    if (g.fixtures.length === 0) return `GW${g.eventId}: no match`;
    const value = g[source];
    return `GW${g.eventId}${gameweekVersusText(g.fixtures)}: ${value === null ? "no figure" : fmtDecimal(value, 1)}`;
  });
  return [head, ...lines].join("\n");
}
