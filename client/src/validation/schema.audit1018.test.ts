import { describe, it, expect } from "vitest";
import { validate, historicBulkSchema, fixturesSchema, parseBootstrapStatic } from "./schema";

// README "Architecture": validation/ (Zod) is per-record — "a bad record is skipped and counted, never fatal".
const goodSeason = { season_name: "2025/26", total_points: 100, minutes: 2000 };
const badSeason = { season_name: "2025/26", total_points: null, minutes: 2000 }; // one malformed field
const goodFixture = { id: 1, event: 1, team_h: 1, team_a: 2, team_h_score: 1, team_a_score: 0, kickoff_time: "2026-08-15T14:00:00Z", finished: true };

describe("audit 2026-10-18 data layer: per-record validation", () => {
  it("bootstrap: one malformed element is skipped and counted (control: this path is per-record)", () => {
    const base = { teams: [], element_types: [], events: [], element_stats: [] };
    const r = parseBootstrapStatic({ ...base, elements: [{ id: 1 }] });
    expect(r.skippedElementCount).toBe(1);
    expect(r.bootstrap.elements).toHaveLength(0);
  });

  it.fails("[DATA-2] historic-bulk: one player's malformed history_past season must not fail the whole dataset", () => {
    const payload = {
      players: [
        { playerId: 1, historyPast: [goodSeason] },
        { playerId: 2, historyPast: [badSeason] },
      ],
      totalPlayers: 2,
      clubSeasons: [],
      skippedPlayerIds: [],
    };
    const out = validate(historicBulkSchema, payload, "historic-bulk");
    expect(out.players.some((p) => p.playerId === 1)).toBe(true);
  });

  it.fails("[DATA-2] fixtures: one malformed fixture must be skipped, not drop every fixture", () => {
    const out = validate(fixturesSchema, [goodFixture, { ...goodFixture, id: 2, finished: "yes" }], "fixtures");
    expect(out.map((f) => f.id)).toContain(1);
  });
});
