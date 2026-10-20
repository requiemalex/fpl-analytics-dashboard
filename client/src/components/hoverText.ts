import type { Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";
import type { ExpectedPointsV2Breakdown } from "../metrics/expectedPointsV2";
import { fmtDecimal } from "../utils/format";

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

const POSITION_PLURAL: Record<Position, string> = { GKP: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" };

const rankPhraseCache = new Map<string, string>();

/**
 * A player's colour in words: his rank within his position (the
 * percentile behind every tint, higher = better, <comparative_colouring>).
 * "Top 8% of midfielders", "Bottom 15% of forwards", or around the middle
 * where the cell has no tint. Undefined without a rank (under the floor,
 * or a figure that's never coloured).
 */
export function playerRankHint(percentile: number | null | undefined, position: Position, label?: string): string | undefined {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile)) return undefined;
  const p = Math.round(percentile);
  const key = `${label ?? ""}|${position}|${p}`;
  let hint = rankPhraseCache.get(key);
  if (hint === undefined) {
    const group = POSITION_PLURAL[position];
    const phrase =
      p >= 60 ? `Top ${Math.max(1, 100 - p)}% of ${group}` : p <= 40 ? `Bottom ${Math.max(1, p)}% of ${group}` : `Around the middle for ${group}`;
    hint = label ? `${label}: ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}` : phrase;
    rankPhraseCache.set(key, hint);
  }
  return hint;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/**
 * A club's colour in words: "3rd of 20 clubs" (best first). `poolSize` is
 * how many clubs have a figure. The percentile counts half of any tie, so
 * this is the tie's middle place, rounded.
 */
export function clubRankHint(percentile: number | null | undefined, poolSize: number, label?: string): string | undefined {
  if (percentile === null || percentile === undefined || !Number.isFinite(percentile) || poolSize < 2) return undefined;
  const place = Math.min(poolSize, Math.max(1, Math.round(poolSize + 0.5 - (percentile * poolSize) / 100)));
  const phrase = `${ordinal(place)} of ${poolSize} clubs`;
  return label ? `${label}: ${phrase}` : phrase;
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
 * The model's figure for one match, in parts: "Model 5.8 v BOU (H) =
 * appearance 1.9 + goals 1.2 + … − goals conceded 0.4", then the inputs he
 * has no data for. The model's general limits are in the README, not here.
 */
export function modelBreakdownHint(b: ExpectedPointsV2Breakdown, fixture: UpcomingFixture | undefined, captain = false): string {
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
  const conceded = b.goalsConceded * scale <= -0.05 ? ` − goals conceded ${fmtDecimal(-b.goalsConceded * scale, 1)}` : "";
  const head = `Scoutline's model${versusText(fixture)}${captain ? " (captain ×2)" : ""}: ${fmtDecimal(b.total * scale, 1)} pts`;
  const sum = shown.length > 0 ? ` = ${shown.join(" + ")}${conceded}` : "";
  const gaps = b.gaps.length > 0 ? `. No data for ${b.gaps.join(", ")}, counted as 0` : "";
  return `${head}${sum}${gaps}`;
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
  xGC: "Expected goals conceded: what the opponents' chances were worth.",
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
