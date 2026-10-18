import { describe, expect, it } from "vitest";
import type { LedgerRow } from "../../clubHistory/types.js";
import { checkAgainstFpl } from "./checks.js";
import type { SeasonData } from "./files.js";
import type { PlayerLink, UsAppearance } from "./types.js";

// 400 linked player-matches, one player per match; player 0 scored once.
const N = 400;
const ledgerRows: LedgerRow[] = Array.from({ length: N }, (_, i) => ({
  fixture: i + 1, element: i + 1, code: 1000 + i, team: 1, wasHome: true, position: 3, round: 1, minutes: 90, starts: 1, totalPoints: 2,
  goals: i === 0 ? 1 : 0, assists: 0, ownGoals: 0, cleanSheets: 0, goalsConceded: 0, saves: 0, bonus: 0, bps: 0, xG: 0, xA: 0, xGI: 0, xGC: 0, dc: 0,
}));
const matchByFixture = new Map(ledgerRows.map((r) => [r.fixture, `m${r.fixture}`]));
const links = new Map<number, PlayerLink>(
  ledgerRows.map((r) => [r.code, { fplCode: r.code, understatId: `u${r.code}`, status: "confirmed", fplName: `P${r.code}`, understatName: `P${r.code}`, season: "2025/26", since: "2026-01-01", note: "" }]),
);
const appearance = (r: LedgerRow, goals: number, ownGoals = 0) =>
  ({ matchId: `m${r.fixture}`, playerId: `u${r.code}`, playerName: "", teamId: "t1", side: "h", position: "FW", minutes: 90, goals, ownGoals, shots: 0, xG: 0, assists: 0, xA: 0, keyPasses: 0, xGChain: 0, xGBuildup: 0, yellowCards: 0, redCards: 0 }) as UsAppearance;
const season = (appearances: UsAppearance[]) => ({ season: "2025/26", appearances }) as SeasonData;

/**
 * Goals are each source's own record and may differ (owner's decision,
 * 2026-10-18), so the comparison only guards against broken player links.
 */
describe("checkAgainstFpl: goals may differ between the sources", () => {
  it("agreement on every player-match passes quietly", () => {
    const r = checkAgainstFpl(season(ledgerRows.map((row) => appearance(row, row.goals))), ledgerRows, matchByFixture, links);
    expect(r.compared).toBe(N);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("a goal one source gives a player and the other calls an own goal (Madueke/Darlow) is reported, not a stop", () => {
    // Player 0's goal is an own goal by player 1 in Understat.
    const apps = ledgerRows.map((row, i) => appearance(row, i === 0 ? 0 : row.goals, i === 1 ? 1 : 0));
    const r = checkAgainstFpl(season(apps), ledgerRows, matchByFixture, links);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("2 of 400");
  });

  it("a share of differences only broken links could cause (above 0.5%) still stops the run", () => {
    const apps = ledgerRows.map((row, i) => appearance(row, i < 3 ? row.goals + 1 : row.goals));
    const r = checkAgainstFpl(season(apps), ledgerRows, matchByFixture, links);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("3 of 400");
  });
});
