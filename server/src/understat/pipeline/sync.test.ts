import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeSeasonLedger } from "../../clubHistory/ledgerFiles.js";
import type { LedgerRow } from "../../clubHistory/types.js";
import { runSync } from "./sync.js";
import { UnderstatBlockedError, type UnderstatClient } from "./understatApi.js";
import type { UsLeague, UsMatch } from "./types.js";

// One live-season match, Home 2-1 Away, two players a side.
const bootstrap = {
  events: [{ id: 1, deadline_time: "2026-08-14T17:30:00Z" }],
  elements: [
    { code: 1001, first_name: "Harry", second_name: "Striker", web_name: "Striker" },
    { code: 1002, first_name: "Kev", second_name: "Keeper", web_name: "Keeper" },
    { code: 2001, first_name: "Ali", second_name: "Winger", web_name: "Winger" },
    { code: 2002, first_name: "Bo", second_name: "Back", web_name: "Back" },
  ],
};

function ledgerRow(element: number, code: number, team: number, wasHome: boolean, minutes: number, goals: number): LedgerRow {
  return {
    fixture: 1, element, code, team, wasHome, position: 3, round: 1, minutes, starts: 1, totalPoints: 2, goals, assists: 0, ownGoals: 0,
    cleanSheets: 0, goalsConceded: 1, saves: 0, bonus: 0, bps: 0, xG: 0, xA: 0, xGI: 0, xGC: 0, dc: 0,
  };
}

function league(homeGoals = 2): UsLeague {
  const history = (teamId: string, side: "h" | "a", scored: number, missed: number, xG: number, xGA: number) => ({
    teamId, datetime: "2026-08-15 15:00:00", side, xG, xGA, npxG: xG, npxGA: xGA, ppdaAtt: 200, ppdaDef: 20, ppdaAllowedAtt: 150, ppdaAllowedDef: 15,
    deep: 6, deepAllowed: 4, scored, missed, xPts: 1.8, result: scored > missed ? "w" : "l", pts: scored > missed ? 3 : 0,
  });
  return {
    year: 2026,
    teams: [
      { id: "71", title: "Home FC", history: [history("71", "h", homeGoals, 1, 1.2, 0.8)] },
      { id: "72", title: "Away United", history: [history("72", "a", 1, homeGoals, 0.8, 1.2)] },
    ],
    matches: [{ id: "m1", datetime: "2026-08-15 15:00:00", isResult: true, homeTeamId: "71", awayTeamId: "72", homeGoals, awayGoals: 1, homeXG: 1.2, awayXG: 0.8, forecastWin: 0.5, forecastDraw: 0.3, forecastLoss: 0.2 }],
    players: [],
  };
}

const app = (playerId: string, playerName: string, teamId: string, side: "h" | "a", goals: number, xG: number, shots: number) => ({
  matchId: "m1", playerId, playerName, teamId, side, position: "FW", minutes: 90, goals, ownGoals: 0, shots, xG, assists: 0, xA: 0.1, keyPasses: 1, xGChain: 0.5, xGBuildup: 0.2, yellowCards: 0, redCards: 0,
});
const shot = (shotId: string, playerId: string, side: "h" | "a", result: string, xG: number) => ({
  shotId, matchId: "m1", playerId, playerName: "", side, minute: 10, x: 0.9, y: 0.5, xG, result, situation: "OpenPlay", shotType: "RightFoot", lastAction: "Pass", assistedBy: "",
});
const match: UsMatch = {
  matchId: "m1",
  appearances: [app("u1", "Harry Striker", "71", "h", 2, 1.2, 3), app("u2", "Kev Keeper", "71", "h", 0, 0, 0), app("u3", "Ali Winger", "72", "a", 1, 0.8, 1), app("u4", "Bo Back", "72", "a", 0, 0, 0)],
  shots: [shot("s1", "u1", "h", "Goal", 0.5), shot("s2", "u1", "h", "Goal", 0.4), shot("s3", "u1", "h", "SavedShot", 0.3), shot("s4", "u3", "a", "Goal", 0.8)],
};

function fakeClient(overrides: Partial<UnderstatClient> = {}): UnderstatClient & { calls: number } {
  const state = { calls: 0 };
  const client: UnderstatClient = {
    async league() {
      state.calls += 1;
      return league();
    },
    async match() {
      state.calls += 1;
      return match;
    },
    requestCount: (): number => state.calls,
    ...overrides,
  };
  return Object.assign(client, {
    get calls() {
      return state.calls;
    },
  });
}

let root: string;
let understatRoot: string;
let clubHistoryRoot: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "understat-sync-"));
  understatRoot = join(root, "understat");
  clubHistoryRoot = join(root, "club-history");
  writeSeasonLedger(clubHistoryRoot, {
    season: "2026/27",
    teams: [
      { id: 1, code: 11, name: "Home", shortName: "HOM" },
      { id: 2, code: 22, name: "Away", shortName: "AWY" },
    ],
    fixtures: [{ id: 1, event: 1, teamH: 1, teamA: 2, teamHScore: 2, teamAScore: 1, finished: true }],
    rows: [ledgerRow(1, 1001, 1, true, 90, 2), ledgerRow(2, 1002, 1, true, 90, 0), ledgerRow(3, 2001, 2, false, 90, 1), ledgerRow(4, 2002, 2, false, 90, 0)],
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sync = (client: UnderstatClient) => runSync({ understatRoot, clubHistoryRoot, bootstrap, client, today: "2026-08-17", maxNewSeasons: 0 });

describe("runSync", () => {
  it("links players, pairs clubs and writes the app's season summary", async () => {
    const report = await sync(fakeClient());
    expect(report.failure).toBeUndefined();
    expect(report.ok).toBe(true);
    expect(readFileSync(join(understatRoot, "links.csv"), "utf8")).toContain("1001,u1,confirmed");
    const season = JSON.parse(readFileSync(join(understatRoot, "app", "2026-27.json"), "utf8"));
    expect(season.players["1001"]).toMatchObject({ goals: 2, shots: 3, shotsOnTarget: 3, minutes: 90 });
    expect(season.clubs["11"]).toMatchObject({ understatTeamId: "71", played: 1, shots: 3, shotsAgainst: 1, pts: 3 });
    expect(JSON.parse(readFileSync(join(understatRoot, "status.json"), "utf8"))).toMatchObject({ liveSeason: "2026/27", seasons: ["2026/27"] });
  });

  it("flags a player's shot-based figures when Understat's shot list is missing one of his shots, without failing the run", async () => {
    // Harry's 0.3 xG saved shot is missing from the list; his line-up still counts it.
    const gappy: UsMatch = { ...match, shots: match.shots.filter((s) => s.shotId !== "s3") };
    const report = await sync(fakeClient({ match: async () => gappy }));
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.includes("missing shots"))).toBe(true);
    const season = JSON.parse(readFileSync(join(understatRoot, "app", "2026-27.json"), "utf8"));
    expect(season.players["1001"].shotsComplete).toBe(false);
    expect(season.players["2001"].shotsComplete).toBe(true);
    expect(season.clubs["11"]).toMatchObject({ shotsCompleteFor: false, shotsCompleteAgainst: true });
    expect(season.clubs["22"]).toMatchObject({ shotsCompleteFor: true, shotsCompleteAgainst: false });
  });

  it("fetches nothing when switched off", async () => {
    mkdirSync(understatRoot, { recursive: true });
    writeFileSync(join(understatRoot, "control.json"), JSON.stringify({ enabled: false, note: "test" }));
    const client = fakeClient();
    const report = await sync(client);
    expect(report.ok).toBe(true);
    expect(client.calls).toBe(0);
    expect(existsSync(join(understatRoot, "links.csv"))).toBe(false);
  });

  it("stops and writes nothing when Understat blocks us", async () => {
    const report = await sync(
      fakeClient({
        league: async () => {
          throw new UnderstatBlockedError("HTTP 403");
        },
      }),
    );
    expect(report.ok).toBe(false);
    expect(report.failure?.kind).toBe("blocked");
    expect(existsSync(join(understatRoot, "links.csv"))).toBe(false);
  });

  it("stops and writes nothing when the sources disagree on a score", async () => {
    const report = await sync(fakeClient({ league: async () => league(3) }));
    expect(report.ok).toBe(false);
    expect(report.failure?.kind).toBe("checks");
    expect(existsSync(join(understatRoot, "app"))).toBe(false);
  });
});
