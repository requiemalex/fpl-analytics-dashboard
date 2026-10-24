import type { ClubSeason, NormalizedFixture, NormalizedTeam } from "../types/normalized";
import { getUpcomingFixtures, type UpcomingFixture } from "./fixtureTicker";

/**
 * <fixture_forecast>: how many goals each side of an upcoming fixture can
 * expect, and from that its chance of a clean sheet, of scoring and of each
 * result — the Team Profile's Fixture Forecast. FPL's own club match
 * records only (club history, every Premier League match since 2016/17 and
 * this season's so far); nothing from a second source.
 *
 * The model (README "Fixture Forecast"):
 *  1. Every club gets an attack rating (how much it creates) and a defence
 *    rating (how much it allows), each relative to the league average (1.0),
 *    from its recent matches — each match's chances as xG where FPL has it
 *    (blended with the goals, `xgWeight`), its goals before xG existed.
 *    Recent matches count most: a match's weight halves every
 *    `halfLifeGameweeks` gameweeks back, across seasons.
 *  2. Ratings are adjusted for the opposition (a club that created 2 xG
 *    against the best defence did better than one that did so against the
 *    worst): each club's figures are divided by what an average side would
 *    have managed against the same opponents, home or away, repeated until
 *    the ratings settle.
 *  3. Every rating starts from `priorMatches` matches' worth of a starting
 *    point, so a club with few recent matches isn't judged on a handful:
 *    the league average for a club that was in the Premier League last
 *    season; for a promoted one, where promoted clubs have typically
 *    finished their first season (worked out from the records).
 *  4. A fixture: home goals expected = the league's average home goals ×
 *    the home side's attack × the away side's defence; away goals the same
 *    the other way round. Goals are treated as Poisson-distributed, so a
 *    clean sheet is e^−(goals expected against), scoring at least once is
 *    1 − e^−(goals expected for), and each result sums the scorelines.
 *
 * The three settings were chosen by backtesting (README): forecasting every
 * match of 2023/24, 2024/25 and 2025/26 from only the matches before it.
 */

export interface ForecastSettings {
  /** How much a match's xG counts against its goals (0–1), where FPL has xG. */
  xgWeight: number;
  /** Gameweeks for a match's weight to halve. */
  halfLifeGameweeks: number;
  /** Matches' worth of the starting point every rating begins from. */
  priorMatches: number;
}

export const FORECAST_SETTINGS: ForecastSettings = { xgWeight: 0.8, halfLifeGameweeks: 19, priorMatches: 4 };

/** A season's gameweeks: a match's place in time is its season's index × this + its gameweek. */
const GAMEWEEKS = 38;
/** Matches weighted below this are left out (about 7 half-lives back): they can't move a rating. */
const MIN_WEIGHT = 0.01;
const ITERATIONS = 25;
/** Scorelines summed for the result chances; 11+ goals for one side is vanishingly rare. */
const MAX_GOALS = 10;

export interface ClubRatings {
  /** Club code -> attack: chances created relative to an average side against the same opponents (1.0 = average). */
  attack: Map<number, number>;
  /** Club code -> defence: chances allowed relative to an average side (1.0 = average; higher concedes more). */
  defence: Map<number, number>;
  /** The league's average goals per match for the home side and the away side, over the same weighted matches. */
  homeGoals: number;
  awayGoals: number;
}

export interface FixtureForecast {
  /** Goals expected for each side. */
  goalsFor: number;
  goalsAgainst: number;
  cleanSheet: number;
  scores: number;
  win: number;
  draw: number;
  loss: number;
}

interface Record_ {
  club: number;
  opponent: number;
  home: boolean;
  weight: number;
  /** Chances for and against: xG blended with goals where FPL has xG, goals otherwise. */
  chancesFor: number;
  chancesAgainst: number;
  goalsFor: number;
}

/** Seasons in order ("2016/17" sorts before "2017/18"). */
const seasonIndex = (seasons: string[]) => new Map([...new Set(seasons)].sort().map((s, i) => [s, i]));

/** A match's place in time. A match with no gameweek counts as the season's last. */
export function matchTime(index: number, event: number | null): number {
  return index * GAMEWEEKS + (event ?? GAMEWEEKS);
}

/**
 * Where promoted clubs have typically finished their first Premier League
 * season: their goals for and against per match relative to that season's
 * league average, averaged over every promotion on record in a completed
 * season before `beforeSeason` (goals, which every season has; xG doesn't
 * go back far enough). 1.0 for both when there's none to go on.
 */
export function promotedStart(clubSeasons: ClubSeason[], beforeSeason: string): { attack: number; defence: number } {
  const bySeason = new Map<string, ClubSeason[]>();
  for (const c of clubSeasons) bySeason.set(c.season, [...(bySeason.get(c.season) ?? []), c]);
  const seasons = [...bySeason.keys()].sort();
  const attack: number[] = [];
  const defence: number[] = [];
  for (let i = 1; i < seasons.length; i++) {
    const season = seasons[i];
    if (season >= beforeSeason) break;
    const clubs = bySeason.get(season)!;
    if (!clubs.every((c) => c.complete)) continue;
    const previous = new Set(bySeason.get(seasons[i - 1])!.map((c) => c.code));
    const played = clubs.reduce((s, c) => s + c.played, 0);
    const average = clubs.reduce((s, c) => s + c.goalsFor, 0) / played;
    for (const c of clubs) {
      if (previous.has(c.code) || c.played === 0) continue;
      attack.push(c.goalsFor / c.played / average);
      defence.push(c.goalsAgainst / c.played / average);
    }
  }
  const mean = (xs: number[]) => (xs.length === 0 ? 1 : xs.reduce((s, x) => s + x, 0) / xs.length);
  return { attack: mean(attack), defence: mean(defence) };
}

/**
 * Every club's ratings from the matches before `now` (a matchTime): the
 * clubs in `currentSeason` start from the league average if they were in
 * `previousSeason`, from promotedStart otherwise.
 */
export function fitClubRatings(clubSeasons: ClubSeason[], now: number, currentSeason: string, settings: ForecastSettings = FORECAST_SETTINGS): ClubRatings {
  const index = seasonIndex(clubSeasons.map((c) => c.season));
  const records: Record_[] = [];
  for (const c of clubSeasons) {
    const i = index.get(c.season)!;
    for (const m of c.matches) {
      const t = matchTime(i, m.event);
      if (t >= now) continue;
      const weight = Math.pow(0.5, (now - t) / settings.halfLifeGameweeks);
      if (weight < MIN_WEIGHT) continue;
      const blend = (xg: number | null, goals: number) => (xg === null ? goals : settings.xgWeight * xg + (1 - settings.xgWeight) * goals);
      records.push({ club: c.code, opponent: m.opponentCode, home: m.home, weight, chancesFor: blend(m.xG, m.goalsFor), chancesAgainst: blend(m.xGC, m.goalsAgainst), goalsFor: m.goalsFor });
    }
  }

  const weighted = (pick: (r: Record_) => number, home: boolean) => {
    let num = 0;
    let den = 0;
    for (const r of records) {
      if (r.home !== home) continue;
      num += r.weight * pick(r);
      den += r.weight;
    }
    return den > 0 ? num / den : 0;
  };
  const chances = { home: weighted((r) => r.chancesFor, true), away: weighted((r) => r.chancesFor, false) };
  const homeGoals = weighted((r) => r.goalsFor, true);
  const awayGoals = weighted((r) => r.goalsFor, false);

  // Starting points: the league average, or where promoted clubs typically finish.
  const sorted = [...index.keys()];
  const previousSeason = sorted[sorted.indexOf(currentSeason) - 1] ?? null;
  const inPrevious = new Set(clubSeasons.filter((c) => c.season === previousSeason).map((c) => c.code));
  const promoted = promotedStart(clubSeasons, currentSeason);
  const clubs = new Set<number>([...records.map((r) => r.club), ...clubSeasons.filter((c) => c.season === currentSeason).map((c) => c.code)]);
  const start = (code: number) => (previousSeason === null || inPrevious.has(code) ? { attack: 1, defence: 1 } : promoted);

  const attack = new Map([...clubs].map((c) => [c, start(c).attack]));
  const defence = new Map([...clubs].map((c) => [c, start(c).defence]));
  const byClub = new Map<number, Record_[]>();
  for (const r of records) byClub.set(r.club, [...(byClub.get(r.club) ?? []), r]);
  const average = (chances.home + chances.away) / 2;
  const k = settings.priorMatches * average;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const nextAttack = new Map<number, number>();
    const nextDefence = new Map<number, number>();
    for (const c of clubs) {
      let forNum = 0;
      let forDen = 0;
      let againstNum = 0;
      let againstDen = 0;
      for (const r of byClub.get(c) ?? []) {
        // What an average side would have created here, at this venue, against this defence — and allowed against this attack.
        forNum += r.weight * r.chancesFor;
        forDen += r.weight * (r.home ? chances.home : chances.away) * (defence.get(r.opponent) ?? 1);
        againstNum += r.weight * r.chancesAgainst;
        againstDen += r.weight * (r.home ? chances.away : chances.home) * (attack.get(r.opponent) ?? 1);
      }
      // Nothing to go on (no matches weighted in, and no starting weight): the starting point itself.
      nextAttack.set(c, forDen + k > 0 ? (forNum + k * start(c).attack) / (forDen + k) : start(c).attack);
      nextDefence.set(c, againstDen + k > 0 ? (againstNum + k * start(c).defence) / (againstDen + k) : start(c).defence);
    }
    // Keep the average side at 1.0 (over the matches, so the ratings and the league averages agree).
    for (const [ratings, next] of [
      [attack, nextAttack],
      [defence, nextDefence],
    ] as const) {
      let num = 0;
      let den = 0;
      for (const r of records) {
        num += r.weight * next.get(r.club)!;
        den += r.weight;
      }
      const scale = den > 0 ? num / den : 1;
      for (const [c, v] of next) ratings.set(c, v / scale);
    }
  }
  return { attack, defence, homeGoals, awayGoals };
}

function poisson(lambda: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= MAX_GOALS; k++) {
    out.push(p);
    p = (p * lambda) / (k + 1);
  }
  return out;
}

/** One fixture from `club`'s side; null when either club has no rating. */
export function forecastFixture(ratings: ClubRatings, club: number, opponent: number, home: boolean): FixtureForecast | null {
  const att = ratings.attack.get(club);
  const def = ratings.defence.get(club);
  const oppAtt = ratings.attack.get(opponent);
  const oppDef = ratings.defence.get(opponent);
  if (att === undefined || def === undefined || oppAtt === undefined || oppDef === undefined) return null;
  const goalsFor = (home ? ratings.homeGoals : ratings.awayGoals) * att * oppDef;
  const goalsAgainst = (home ? ratings.awayGoals : ratings.homeGoals) * oppAtt * def;
  const ours = poisson(goalsFor);
  const theirs = poisson(goalsAgainst);
  let win = 0;
  let draw = 0;
  for (let a = 0; a <= MAX_GOALS; a++) {
    for (let b = 0; b <= MAX_GOALS; b++) {
      if (a > b) win += ours[a] * theirs[b];
      else if (a === b) draw += ours[a] * theirs[b];
    }
  }
  // What the grid leaves out (11+ goals) is too small to show; scaled so the three add up to 1.
  const covered = ours.reduce((s, p) => s + p, 0) * theirs.reduce((s, p) => s + p, 0);
  const loss = covered - win - draw;
  return { goalsFor, goalsAgainst, cleanSheet: Math.exp(-goalsAgainst), scores: 1 - Math.exp(-goalsFor), win: win / covered, draw: draw / covered, loss: loss / covered };
}

/** The time to forecast from: just after the latest match played, in the latest season. */
export function forecastNow(clubSeasons: ClubSeason[]): { now: number; season: string } | null {
  const index = seasonIndex(clubSeasons.map((c) => c.season));
  const season = [...index.keys()].pop();
  if (season === undefined) return null;
  let latest = matchTime(index.get(season)!, 0);
  for (const c of clubSeasons) {
    if (c.season !== season) continue;
    for (const m of c.matches) latest = Math.max(latest, matchTime(index.get(season)!, m.event));
  }
  return { now: latest + 1, season };
}

/** One of a club's upcoming fixtures and its forecast (null when either club has no rating). */
export interface UpcomingForecast {
  fixture: UpcomingFixture;
  gameweek: number | null;
  forecast: FixtureForecast | null;
}

/**
 * Every club's next `count` fixtures (getUpcomingFixtures), forecast from
 * the ratings as of the latest match played — every club's, as the Team
 * Profile's colours rank a club's forecast among all of them. Empty while
 * the club records haven't loaded.
 */
export function forecastUpcomingFixtures(
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
  teamsById: Map<number, NormalizedTeam>,
  clubSeasons: ClubSeason[],
  count = 5,
): Map<number, UpcomingForecast[]> {
  const out = new Map<number, UpcomingForecast[]>();
  const from = forecastNow(clubSeasons);
  if (!from) return out;
  const ratings = fitClubRatings(clubSeasons, from.now, from.season);
  const gameweekById = new Map(fixtures.map((f) => [f.id, f.eventId]));
  for (const team of teams) {
    if (team.code === null) continue;
    out.set(
      team.id,
      getUpcomingFixtures(team.id, fixtures, teamsById, count).map((fixture) => {
        const opponentCode = teamsById.get(fixture.opponentTeamId)?.code ?? null;
        return {
          fixture,
          gameweek: gameweekById.get(fixture.fixtureId) ?? null,
          forecast: opponentCode === null ? null : forecastFixture(ratings, team.code!, opponentCode, fixture.isHome),
        };
      }),
    );
  }
  return out;
}
