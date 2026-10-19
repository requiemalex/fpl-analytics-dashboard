import { describe, expect, it } from "vitest";
import { makePlayer, makeSeason, makeTeam } from "../test/fixtures";
import type { HistoricPlayerProfile } from "../metrics/historicAnalysis";
import { resolveUnderstatClub, resolveUnderstatPlayer } from "./resolve";
import type { UnderstatData, UsClubTotals, UsPlayerTotals } from "./schema";

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
const situations = () => ({ OpenPlay: slice(), FromCorner: slice(), SetPiece: slice(), DirectFreekick: slice(), Penalty: slice() });

function totals(over: Partial<UsPlayerTotals>): UsPlayerTotals {
  return {
    understatId: "u1", appearances: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, keyPasses: 0, xG: 0, xA: 0, npxG: 0, npGoals: 0,
    xGChain: 0, xGBuildup: 0, situations: situations(), bodyParts: { RightFoot: slice(), LeftFoot: slice(), Head: slice(), OtherBodyPart: slice() }, shotsComplete: true,
    ...over,
  };
}

function club(over: Partial<UsClubTotals>): UsClubTotals {
  return {
    understatTeamId: "71", played: 38, xG: 0, xGA: 0, npxG: 0, npxGA: 0, ppdaAtt: 0, ppdaDef: 0, ppdaAllowedAtt: 0, ppdaAllowedDef: 0, deep: 0, deepAllowed: 0,
    xPts: 0, pts: 0, goalsFor: 0, goalsAgainst: 0, assists: 0, xA: 0, keyPasses: 0, shots: 0, shotsOnTarget: 0, shotsAgainst: 0, shotsOnTargetAgainst: 0,
    situationsFor: situations(), situationsAgainst: situations(), shotsCompleteFor: true, shotsCompleteAgainst: true,
    ...over,
  };
}

const player = makePlayer({ id: 1, code: 501, position: "FWD", minutes: 900 });
const data: Extract<UnderstatData, { enabled: true }> = {
  enabled: true,
  generatedAt: "2026-10-18T06:10:00Z",
  liveSeason: "2026/27",
  latestMatchDate: "2026-10-17",
  missingFixtures: {},
  skippedRecords: 0,
  seasons: new Map([
    ["2026/27", { season: "2026/27", complete: false, latestMatchDate: "2026-10-17", players: new Map([[501, totals({ minutes: 800, shots: 20, xG: 4 })]]), clubs: new Map([[11, club({ xG: 9, played: 7 })]]) }],
    ["2025/26", { season: "2025/26", complete: true, latestMatchDate: null, players: new Map([[501, totals({ minutes: 3000, shots: 90, xG: 15 })]]), clubs: new Map([[11, club({ xG: 60, ppdaAtt: 1000, ppdaDef: 100 })]]) }],
    ["2024/25", { season: "2024/25", complete: true, latestMatchDate: null, players: new Map(), clubs: new Map([[11, club({ xG: 40, ppdaAtt: 1200, ppdaDef: 100 })]]) }],
    ["2023/24", { season: "2023/24", complete: true, latestMatchDate: null, players: new Map([[501, totals({ minutes: 1000, shots: 30, xG: 5 })]]), clubs: new Map() }],
  ]),
};

function profile(seasons: { name: string; minutes: number }[], last: string | null): Map<number, HistoricPlayerProfile> {
  const all = seasons.map((s) => makeSeason({ seasonName: s.name, minutes: s.minutes }));
  // floorSeasonsInWindow as buildHistoricPlayerProfile makes it: the window's 450+ minute seasons.
  return new Map([[1, { lastCompletedSeason: all.find((s) => s.seasonName === last) ?? null, allSeasonsInWindow: all, floorSeasonsInWindow: all.filter((s) => s.minutes >= 450) } as unknown as HistoricPlayerProfile]]);
}

describe("resolveUnderstatPlayer", () => {
  it("Current Season: this season's Understat totals", () => {
    const r = resolveUnderstatPlayer(player, "live", { data, historicProfiles: new Map(), currentSeasonHasStarted: true });
    expect(r?.totals).toMatchObject({ shots: 20, xG: 4, minutes: 800 });
    expect(r?.seasons).toBe(1);
  });

  it("Current Season before a ball is kicked: nobody has played, so nothing to show (—)", () => {
    expect(resolveUnderstatPlayer(player, "live", { data, historicProfiles: new Map(), currentSeasonHasStarted: false })).toBeNull();
  });

  it("a player FPL says played but Understat has nothing for (link on hold) is unknown, never 0", () => {
    const unlinked = makePlayer({ id: 2, code: 999, position: "MID", minutes: 450 });
    expect(resolveUnderstatPlayer(unlinked, "live", { data, historicProfiles: new Map(), currentSeasonHasStarted: true })).toBeNull();
    // FPL says 0 minutes: nothing to show (<no_minutes_no_figures>), "—" like his FPL figures, not zeros.
    const benched = makePlayer({ id: 3, code: 998, position: "MID", minutes: 0 });
    expect(resolveUnderstatPlayer(benched, "live", { data, historicProfiles: new Map(), currentSeasonHasStarted: true })).toBeNull();
  });

  it("Last Completed Season: that season, from FPL's season list", () => {
    const r = resolveUnderstatPlayer(player, "lastSeason", { data, historicProfiles: profile([{ name: "2025/26", minutes: 3000 }], "2025/26"), currentSeasonHasStarted: true });
    expect(r?.totals.shots).toBe(90);
  });

  it("Historic Average: the one Historic Average — only seasons of 450+ FPL minutes count (a 0-minute or short season doesn't), an unknown one is left out", () => {
    const seasons = [
      { name: "2023/24", minutes: 1000 },
      { name: "2024/25", minutes: 0 }, // under the floor: doesn't count
      { name: "2025/26", minutes: 3000 },
    ];
    const r = resolveUnderstatPlayer(player, "historicAverage", { data, historicProfiles: profile(seasons, "2025/26"), currentSeasonHasStarted: true });
    expect(r?.seasons).toBe(2);
    expect(r?.totals.shots).toBe(120);
    const short = [...seasons.slice(0, 1), { name: "2024/25", minutes: 449 }, seasons[2]];
    expect(resolveUnderstatPlayer(player, "historicAverage", { data, historicProfiles: profile(short, "2025/26"), currentSeasonHasStarted: true })?.seasons).toBe(2);
    const withUnknown = [...seasons.slice(0, 1), { name: "2024/25", minutes: 500 }, seasons[2]];
    const r2 = resolveUnderstatPlayer(player, "historicAverage", { data, historicProfiles: profile(withUnknown, "2025/26"), currentSeasonHasStarted: true });
    expect(r2?.seasons).toBe(2);
  });
});

describe("resolveUnderstatClub", () => {
  const team = makeTeam({ id: 1, code: 11 });
  it("Historic Average covers only seasons the club has a record for, and keeps totals for ratios", () => {
    const r = resolveUnderstatClub(team, "historicAverage", { data, referenceSeason: "2025/26", currentSeasonHasStarted: true });
    expect(r?.seasons).toBe(2);
    expect(r?.totals.xG).toBe(100);
    expect(r && r.totals.ppdaAtt / r.totals.ppdaDef).toBe(11);
  });
  it("Current Season: the live season's record", () => {
    expect(resolveUnderstatClub(team, "live", { data, referenceSeason: "2025/26", currentSeasonHasStarted: true })?.totals.xG).toBe(9);
  });
  it("no record for the view is null", () => {
    expect(resolveUnderstatClub(makeTeam({ id: 2, code: 99 }), "lastSeason", { data, referenceSeason: "2025/26", currentSeasonHasStarted: true })).toBeNull();
  });
});

describe("shot detail across seasons", () => {
  const detail = (woodwork: number) => ({ woodwork, blocked: 0, assisted: 0, lastActions: { Cross: slice(), Throughball: slice(), TakeOn: slice(), Rebound: slice() } });
  const withDetail = (seasons: [string, UsPlayerTotals][]) => ({
    ...data,
    seasons: new Map(seasons.map(([name, t]) => [name, { season: name, complete: true, latestMatchDate: null, players: new Map([[501, t]]), clubs: new Map() }])),
  });
  const ctx = (d: typeof data) => ({ data: d, historicProfiles: profile([{ name: "2024/25", minutes: 900 }, { name: "2025/26", minutes: 900 }], "2025/26"), currentSeasonHasStarted: true });
  it("Historic Average adds it up over the seasons", () => {
    const r = resolveUnderstatPlayer(player, "historicAverage", ctx(withDetail([["2024/25", totals({ shotDetail: detail(2) })], ["2025/26", totals({ shotDetail: detail(3) })]])));
    expect(r?.totals.shotDetail?.woodwork).toBe(5);
  });
  it("a season file without it makes the whole Historic Average's shot detail unknown, never a partial sum", () => {
    const r = resolveUnderstatPlayer(player, "historicAverage", ctx(withDetail([["2024/25", totals({})], ["2025/26", totals({ shotDetail: detail(3) })]])));
    expect(r?.totals.shotDetail).toBeUndefined();
    expect(r?.totals.shots).toBe(0);
  });
});
