import { describe, expect, it } from "vitest";
import type { LedgerRow } from "../../clubHistory/types.js";
import { acceptedDifferenceKey, checkAgainstFpl } from "./checks.js";
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

describe("checkAgainstFpl (audit 2026-10-18 H2)", () => {
  it("agreement on every player-match passes", () => {
    const r = checkAgainstFpl(season(ledgerRows.map((row) => appearance(row, row.goals))), ledgerRows, matchByFixture, links);
    expect(r.compared).toBe(N);
    expect(r.errors).toEqual([]);
  });

  it("a single goals difference in 400 player-matches (0.25%) stops the run", () => {
    // Understat gives player 0's goal as an own goal by nobody linked: 0 goals.
    const r = checkAgainstFpl(season(ledgerRows.map((row, i) => appearance(row, i === 0 ? 0 : row.goals))), ledgerRows, matchByFixture, links);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("1 of 400");
    expect(r.errors[0]).toContain("FPL code 1000");
  });

  it("a difference the owner listed in accepted-differences.csv is a warning, not an error; any other still stops the run", () => {
    const apps = ledgerRows.map((row, i) => appearance(row, i === 0 ? 0 : row.goals, i === 5 ? 1 : 0));
    const accepted = new Set([acceptedDifferenceKey("2025/26", "m1", 1000)]);
    const r = checkAgainstFpl(season(apps), ledgerRows, matchByFixture, links, accepted);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("FPL code 1005");
    expect(r.errors[0]).not.toContain("FPL code 1000");
    expect(r.warnings.some((w) => w.includes("reviewed") && w.includes("FPL code 1000"))).toBe(true);

    const onlyAccepted = checkAgainstFpl(season(ledgerRows.map((row, i) => appearance(row, i === 0 ? 0 : row.goals))), ledgerRows, matchByFixture, links, accepted);
    expect(onlyAccepted.errors).toEqual([]);
  });
});
