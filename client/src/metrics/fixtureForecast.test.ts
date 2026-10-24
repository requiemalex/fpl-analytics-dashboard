import { describe, it, expect } from "vitest";
import { fitClubRatings, forecastFixture, forecastNow, forecastUpcomingFixtures, matchTime, promotedStart, type ForecastSettings } from "./fixtureForecast";
import { clubSeasonsAsShown } from "./teamStats";
import { makeTeam } from "../test/fixtures";
import type { ClubMatch, ClubSeason, NormalizedFixture } from "../types/normalized";

// <fixture_forecast>: the Team Profile's Fixture Forecast model.

type Truth = Record<number, { attack: number; defence: number }>;
const HOME = 1.6;
const AWAY = 1.2;

/**
 * A double round robin played exactly to the model: each side's xG (and,
 * here, goals) is the venue average × its attack × the opponent's defence.
 * `goals` overrides the goals (xG stays), for the xG/goals blend.
 */
function season(name: string, truth: Truth, opts: { complete?: boolean; goals?: (xg: number) => number } = {}): ClubSeason[] {
  const codes = Object.keys(truth).map(Number);
  const matches = new Map<number, ClubMatch[]>(codes.map((c) => [c, []]));
  let event = 1;
  let fixture = 1;
  for (const h of codes) {
    for (const a of codes) {
      if (h === a) continue;
      const xgH = HOME * truth[h].attack * truth[a].defence;
      const xgA = AWAY * truth[a].attack * truth[h].defence;
      const gH = opts.goals ? opts.goals(xgH) : xgH;
      const gA = opts.goals ? opts.goals(xgA) : xgA;
      const base = { fixture, event, fantasyPoints: 0, goals: 0, assists: 0, bonus: 0, xA: 0, xGI: 0, dc: 0 };
      matches.get(h)!.push({ ...base, opponentCode: a, home: true, goalsFor: gH, goalsAgainst: gA, xG: xgH, xGC: xgA });
      matches.get(a)!.push({ ...base, opponentCode: h, home: false, goalsFor: gA, goalsAgainst: gH, xG: xgA, xGC: xgH });
      fixture += 1;
      event += 1;
    }
  }
  return codes.map((code) => {
    const ms = matches.get(code)!;
    const goalsFor = ms.reduce((s, m) => s + m.goalsFor, 0);
    const goalsAgainst = ms.reduce((s, m) => s + m.goalsAgainst, 0);
    return {
      season: name, code, name: `Club ${code}`, shortName: `C${code}`, complete: opts.complete ?? true,
      played: ms.length, wins: 0, draws: 0, losses: 0, goalsFor, goalsAgainst, cleanSheets: 0, leaguePoints: 0, leaguePosition: 0,
      fantasyPoints: 0, goals: 0, assists: 0, bonus: 0, xG: null, xA: null, xGI: null, xGC: null, dc: null, matches: ms,
    };
  });
}

const EXACT: ForecastSettings = { xgWeight: 1, halfLifeGameweeks: 1e9, priorMatches: 0 };
const TRUTH: Truth = { 1: { attack: 1.4, defence: 0.7 }, 2: { attack: 1.0, defence: 1.0 }, 3: { attack: 0.8, defence: 1.2 }, 4: { attack: 0.9, defence: 1.15 } };
/** The truth with its average at 1.0 over the matches, as the fit keeps it. */
function normalised(truth: Truth): Truth {
  const codes = Object.keys(truth).map(Number);
  const mean = (k: "attack" | "defence") => codes.reduce((s, c) => s + truth[c][k], 0) / codes.length;
  return Object.fromEntries(codes.map((c) => [c, { attack: truth[c].attack / mean("attack"), defence: truth[c].defence / mean("defence") }]));
}

describe("the Fixture Forecast's ratings", () => {
  it("recover the clubs' strengths from matches played to them, the opposition taken into account", () => {
    const seasons = season("2025/26", TRUTH);
    const r = fitClubRatings(seasons, matchTime(0, 99), "2025/26", EXACT);
    const want = normalised(TRUTH);
    for (const code of [1, 2, 3, 4]) {
      expect(r.attack.get(code)).toBeCloseTo(want[code].attack, 3);
      expect(r.defence.get(code)).toBeCloseTo(want[code].defence, 3);
    }
    // And so forecast the matches they were made from: club 1 at home to club 3.
    const f = forecastFixture(r, 1, 3, true)!;
    const avgHome = seasons.flatMap((c) => c.matches).filter((m) => m.home).reduce((s, m, _, a) => s + m.goalsFor / a.length, 0);
    expect(f.goalsFor).toBeCloseTo(avgHome * want[1].attack * want[3].defence, 3);
  });

  it("count recent matches most: a club that has since got worse is rated nearer its recent form", () => {
    const before = { ...TRUTH, 2: { attack: 1.6, defence: 1.0 } };
    const after = { ...TRUTH, 2: { attack: 0.6, defence: 1.0 } };
    const seasons = [...season("2024/25", before), ...season("2025/26", after)];
    // Just after 2025/26's last match (each season's 12 matches are gameweeks 1–12).
    const r = fitClubRatings(seasons, matchTime(1, 13), "2025/26", { xgWeight: 1, halfLifeGameweeks: 4, priorMatches: 0 });
    const others = (r.attack.get(1)! + r.attack.get(3)! + r.attack.get(4)!) / 3;
    // Relative to the rest, closer to his recent 0.6 than his old 1.6.
    expect(r.attack.get(2)! / others).toBeLessThan(0.8);
  });

  it("blend xG with goals where FPL has xG, and use goals alone where it doesn't (a partial live season)", () => {
    // Goals twice the xG for everyone but club 1, who scores exactly his xG: on xG alone he's the best attack; on goals, not.
    const seasons = season("2025/26", TRUTH, { goals: (xg) => xg });
    const lucky = seasons.map((c) => (c.code === 1 ? c : { ...c, matches: c.matches.map((m) => ({ ...m, goalsFor: m.goalsFor * 3 })) }));
    const onXG = fitClubRatings(lucky, matchTime(0, 99), "2025/26", { xgWeight: 1, halfLifeGameweeks: 1e9, priorMatches: 0 });
    const onGoals = fitClubRatings(lucky, matchTime(0, 99), "2025/26", { xgWeight: 0, halfLifeGameweeks: 1e9, priorMatches: 0 });
    expect(onXG.attack.get(1)!).toBeGreaterThan(onXG.attack.get(2)!);
    expect(onGoals.attack.get(1)!).toBeLessThan(onGoals.attack.get(2)!);
    // With the live season's player sums partial, its xG is blanked (clubSeasonsAsShown), so the goals are all there is.
    const shown = clubSeasonsAsShown({ clubSeasons: lucky, referenceSeason: "2024/25", currentSeasonHasStarted: true, livePlayerSumsPartial: true });
    expect(shown.flatMap((c) => c.matches).every((m) => m.xG === null && m.xGC === null)).toBe(true);
    const partial = fitClubRatings(shown, matchTime(0, 99), "2025/26", { xgWeight: 1, halfLifeGameweeks: 1e9, priorMatches: 0 });
    expect(partial.attack.get(1)!).toBeCloseTo(onGoals.attack.get(1)!, 6);
  });

  it("start a promoted club from where promoted clubs typically finish their first season", () => {
    // 2024/25: club 5 is promoted (not in 2023/24) and scores 70% of the league average, concedes 130%.
    const promotedTruth = { 1: TRUTH[1], 2: TRUTH[2], 3: TRUTH[3], 5: { attack: 0.7, defence: 1.3 } };
    const history = [...season("2023/24", TRUTH), ...season("2024/25", promotedTruth)];
    const start = promotedStart(history, "2025/26");
    expect(start.attack).toBeLessThan(0.85);
    expect(start.defence).toBeGreaterThan(1.15);
    // 2025/26 hasn't started; club 6 is new to the league, so with nothing of its own it sits at that start (before the average is re-centred).
    const current: ClubSeason[] = [...season("2025/26", { 1: TRUTH[1], 2: TRUTH[2], 5: promotedTruth[5], 6: TRUTH[2] }, { complete: false })].map((c) => ({ ...c, matches: [] }));
    const r = fitClubRatings([...history, ...current], matchTime(2, 0), "2025/26", { xgWeight: 1, halfLifeGameweeks: 19, priorMatches: 4 });
    expect(r.attack.get(6)! / r.attack.get(2)!).toBeLessThan(0.9);
    expect(r.defence.get(6)! / r.defence.get(2)!).toBeGreaterThan(1.1);
  });
});

describe("a fixture's forecast", () => {
  const r = fitClubRatings(season("2025/26", TRUTH), matchTime(0, 99), "2025/26", EXACT);

  it("a clean sheet is no goals against, scoring at least one goal; the results add up to 100%", () => {
    const f = forecastFixture(r, 1, 3, true)!;
    expect(f.cleanSheet).toBeCloseTo(Math.exp(-f.goalsAgainst), 10);
    expect(f.scores).toBeCloseTo(1 - Math.exp(-f.goalsFor), 10);
    expect(f.win + f.draw + f.loss).toBeCloseTo(1, 10);
    expect(f.win).toBeGreaterThan(f.loss);
  });

  it("is the same match from both sides", () => {
    const home = forecastFixture(r, 1, 3, true)!;
    const away = forecastFixture(r, 3, 1, false)!;
    expect(away.goalsFor).toBeCloseTo(home.goalsAgainst, 10);
    expect(away.win).toBeCloseTo(home.loss, 10);
    expect(away.cleanSheet).toBeCloseTo(1 - home.scores, 10);
  });

  it("home advantage: the same pair forecast better for the home side", () => {
    expect(forecastFixture(r, 2, 4, true)!.goalsFor).toBeGreaterThan(forecastFixture(r, 2, 4, false)!.goalsFor);
  });

  it("nothing weighted in and no starting weight: the starting point, never NaN", () => {
    const empty = fitClubRatings(season("2025/26", TRUTH), matchTime(5, 0), "2025/26", { xgWeight: 1, halfLifeGameweeks: 1, priorMatches: 0 });
    expect([...empty.attack.values()].every(Number.isFinite)).toBe(true);
  });

  it("no rating for a club, no forecast", () => {
    expect(forecastFixture(r, 1, 99, true)).toBeNull();
  });
});

describe("forecasting the upcoming fixtures", () => {
  it("from just after the latest match played, every club's next fixtures, in order", () => {
    const seasons = [...season("2024/25", TRUTH), ...season("2025/26", TRUTH, { complete: false }).map((c) => ({ ...c, matches: c.matches.filter((m) => m.event! <= 3) }))];
    expect(forecastNow(seasons)).toEqual({ now: matchTime(1, 3) + 1, season: "2025/26" });
    const teams = [1, 2, 3, 4].map((code) => makeTeam({ id: code * 10, code, shortName: `C${code}` }));
    const fixture = (id: number, eventId: number, home: number, away: number): NormalizedFixture => ({
      id, eventId, homeTeamId: home * 10, awayTeamId: away * 10, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 3,
    });
    const all = forecastUpcomingFixtures(teams, [fixture(2, 5, 3, 1), fixture(1, 4, 1, 2)], new Map(teams.map((t) => [t.id, t])), seasons);
    const club1 = all.get(10)!;
    expect(club1.map((r) => [r.gameweek, r.fixture.opponentShortName, r.fixture.isHome])).toEqual([
      [4, "C2", true],
      [5, "C3", false],
    ]);
    expect(club1.every((r) => r.forecast !== null)).toBe(true);
    expect(all.get(40)).toEqual([]);
  });
});
