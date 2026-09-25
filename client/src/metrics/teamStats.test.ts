import { describe, it, expect } from "vitest";
import { clubPlayerFigures, clubSeasonHistory, clubSeasonsForMode, computeTeamAggregates, type ClubHistoryContext } from "./teamStats";
import { makeTeam } from "../test/fixtures";
import { teamHeaderLine } from "../components/TeamDetailOverlay";
import type { ClubPlayerSeason, ClubSeason } from "../types/normalized";

function player(code: number, overrides: Partial<ClubPlayerSeason> = {}): ClubPlayerSeason {
  return { code, minutes: 900, starts: 10, totalPoints: 50, goals: 2, assists: 1, cleanSheets: 3, bonus: 4, xG: 2, xA: 1, xGI: 3, xGC: 10, dc: 40, ...overrides };
}

function clubSeason(code: number, season: string, overrides: Partial<ClubSeason> = {}): ClubSeason {
  return {
    season,
    code,
    name: `Club ${code}`,
    shortName: `C${code}`,
    complete: true,
    played: 38,
    wins: 20,
    draws: 10,
    losses: 8,
    goalsFor: 60,
    goalsAgainst: 40,
    cleanSheets: 12,
    leaguePoints: 70,
    leaguePosition: 4,
    fantasyPoints: 1800,
    goals: 58,
    assists: 45,
    bonus: 100,
    xG: 55,
    xA: 40,
    xGI: 95,
    xGC: 42,
    dc: 2800,
    players: [],
    ...overrides,
  };
}

// Club codes: team id 1 → code 101, team id 2 → code 102 (see makeTeam).
const teams = [makeTeam({ id: 1 }), makeTeam({ id: 2 })];

const ctx: ClubHistoryContext = {
  referenceSeason: "2025/26",
  currentSeasonHasStarted: true,
  clubSeasons: [
    clubSeason(101, "2022/23", { leaguePoints: 60, xGC: 50 }),
    clubSeason(101, "2024/25", { leaguePoints: 80, xGC: 30 }),
    clubSeason(101, "2025/26", { leaguePoints: 70, xGC: 42, players: [player(9001, { totalPoints: 120 })] }),
    clubSeason(101, "2026/27", { complete: false, played: 5, leaguePoints: 10, xGC: 6 }),
    // Club 102 was promoted this season — no 2025/26 record at all.
    clubSeason(102, "2026/27", { complete: false, played: 5, leaguePoints: 4 }),
    // A club no longer in the league keeps its history but isn't a current team.
    clubSeason(999, "2025/26"),
  ],
};

describe("clubSeasonsForMode", () => {
  it("maps each Data View to its season(s)", () => {
    expect(clubSeasonsForMode("live", "2025/26")).toEqual(["2026/27"]);
    expect(clubSeasonsForMode("lastSeason", "2025/26")).toEqual(["2025/26"]);
    expect(clubSeasonsForMode("historicAverage", "2025/26")).toEqual(["2025/26", "2024/25", "2023/24", "2022/23"]);
    expect(clubSeasonsForMode("lastSeason", null)).toEqual([]);
  });
});

describe("computeTeamAggregates — <club_not_squad>", () => {
  it("reads that season's club record, league table included", () => {
    const [club] = computeTeamAggregates(teams, "lastSeason", ctx);
    expect(club).toMatchObject({ teamId: 1, leaguePoints: 70, leaguePosition: 4, xGC: 42, points: 1800, goalsAgainst: 40 });
  });

  it("reads the live season for Current Season", () => {
    const [club] = computeTeamAggregates(teams, "live", ctx);
    expect(club).toMatchObject({ played: 5, leaguePoints: 10, xGC: 6 });
  });

  it("averages Historic Average over the window seasons the club was actually in the league", () => {
    const [club] = computeTeamAggregates(teams, "historicAverage", ctx);
    // 2025/26, 2024/25, 2022/23 — 2023/24 is missing, and isn't counted as a zero.
    expect(club.leaguePoints).toBe((70 + 80 + 60) / 3);
    expect(club.xGC).toBe((42 + 30 + 50) / 3);
  });

  it("averages each metric only over the window seasons that have a value for it — a blank season isn't counted", () => {
    // DC tracked in 2025/26 only; xG in 2024/25 and 2025/26 only.
    const partial: ClubHistoryContext = {
      ...ctx,
      clubSeasons: [
        clubSeason(101, "2023/24", { xG: null, dc: null, leaguePoints: 60 }),
        clubSeason(101, "2024/25", { xG: 50, dc: null, leaguePoints: 80 }),
        clubSeason(101, "2025/26", { xG: 70, dc: 3000, leaguePoints: 70 }),
      ],
    };
    const [club] = computeTeamAggregates(teams, "historicAverage", partial);
    expect(club.leaguePoints).toBe(70); // (60 + 80 + 70) / 3
    expect(club.xG).toBe(60); // (50 + 70) / 2 — not / 3
    expect(club.defensiveContributions).toBe(3000); // 2025/26 alone — not / 3
  });

  it("gives a club with no record for the view nulls (—), never 0", () => {
    const [, promoted] = computeTeamAggregates(teams, "lastSeason", ctx);
    expect(promoted.leaguePoints).toBeNull();
    expect(promoted.xG).toBeNull();
  });

  it("only returns current clubs", () => {
    expect(computeTeamAggregates(teams, "lastSeason", ctx).map((t) => t.teamId)).toEqual([1, 2]);
  });

  it("is genuinely zero in Current Season before a ball is kicked", () => {
    const preseason = { ...ctx, currentSeasonHasStarted: false, clubSeasons: ctx.clubSeasons.filter((c) => c.season !== "2026/27") };
    const [club] = computeTeamAggregates(teams, "live", preseason);
    expect(club.leaguePoints).toBe(0);
    expect(club.leaguePosition).toBeNull();
  });

  it("is null (not 0) before club history has loaded", () => {
    const [club] = computeTeamAggregates(teams, "live", { clubSeasons: [], referenceSeason: null, currentSeasonHasStarted: true });
    expect(club.leaguePoints).toBeNull();
  });
});

describe("clubPlayerFigures", () => {
  it("returns only what a player did FOR this club in the view's season", () => {
    const figures = clubPlayerFigures(101, "lastSeason", ctx);
    expect(figures.get(9001)?.totalPoints).toBe(120);
    expect(clubPlayerFigures(101, "live", ctx).has(9001)).toBe(false);
  });
});

describe("clubSeasonHistory", () => {
  it("lists every season on record for the club, oldest first, live season flagged", () => {
    expect(clubSeasonHistory(101, ctx.clubSeasons)).toEqual([
      { seasonName: "2022/23", totalPoints: 1800, complete: true },
      { seasonName: "2024/25", totalPoints: 1800, complete: true },
      { seasonName: "2025/26", totalPoints: 1800, complete: true },
      { seasonName: "2026/27", totalPoints: 1800, complete: false },
    ]);
  });
});

describe("teamHeaderLine — the Team Profile header follows the Data View (audit 2026-09-25 player-team-profiles M1)", () => {
  it("shows a season's league line, and a Historic Average rounded the way Team Explorer shows it", () => {
    const history = { ...ctx, clubSeasons: [clubSeason(101, "2025/26", { leaguePosition: 3, leaguePoints: 71 }), clubSeason(101, "2024/25", { leaguePosition: 4, leaguePoints: 70, wins: 21 })] };
    const [last] = computeTeamAggregates([teams[0]], "lastSeason", history);
    expect(teamHeaderLine(last)).toBe("3rd in table · 71 pts · 38 played · 20W 10D 8L");
    const [avg] = computeTeamAggregates([teams[0]], "historicAverage", history);
    expect(teamHeaderLine(avg)).toBe("4th in table · 71 pts · 38 played · 21W 10D 8L"); // 3.5 → 4, 70.5 → 71, 20.5 → 21
  });

  it("is — for a season the club has no record of", () => {
    const [none] = computeTeamAggregates([teams[1]], "lastSeason", { ...ctx, clubSeasons: [] });
    expect(teamHeaderLine(none)).toBe("—");
  });
});
