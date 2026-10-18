import { describe, it, expect } from "vitest";
import { validate, historicBulkSchema, fixturesSchema, parseBootstrapStatic, skippedRecordCount } from "./schema";
import { makeRawElement } from "../test/rawFixtures";

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

  it("[DATA-2] historic-bulk: one player's malformed history_past season must not fail the whole dataset", () => {
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

  it("[DATA-2] fixtures: one malformed fixture must be skipped, not drop every fixture", () => {
    const out = validate(fixturesSchema, [goodFixture, { ...goodFixture, id: 2, finished: "yes" }], "fixtures");
    expect(out.map((f) => f.id)).toContain(1);
  });

  // Phase 2 (M2): what's skipped is counted, and a player is skipped whole.
  it("[DATA-2] the skipped fixture is counted; a list with none skipped counts 0", () => {
    const out = validate(fixturesSchema, [goodFixture, { ...goodFixture, id: 2, finished: "yes" }], "fixtures");
    expect(out.map((f) => f.id)).toEqual([1]);
    expect(skippedRecordCount(out)).toBe(1);
    expect(skippedRecordCount(validate(fixturesSchema, [goodFixture], "fixtures"))).toBe(0);
  });

  it("[DATA-2] a player with one unreadable season is left out whole and joins skippedPlayerIds (no part-history); a bad club-season is counted", () => {
    const payload = {
      players: [
        { playerId: 1, historyPast: [goodSeason] },
        { playerId: 2, historyPast: [goodSeason, badSeason] },
      ],
      totalPlayers: 2,
      clubSeasons: [{ season: "2025/26" }],
      skippedPlayerIds: [7],
    };
    const out = validate(historicBulkSchema, payload, "historic-bulk");
    expect(out.players.map((p) => p.playerId)).toEqual([1]);
    expect(out.skippedPlayerIds).toEqual([7, 2]);
    expect(out.clubSeasons).toEqual([]);
    expect(skippedRecordCount(out.clubSeasons)).toBe(1);
    // R3: player 2 is only unreadable here; the server fetched him, so its club figures are whole. Player 7 the server couldn't fetch.
    expect(out.unreadablePlayerIds).toEqual([2]);
  });

  it("[DATA-2] a broken top-level shape is still fatal", () => {
    expect(() => validate(historicBulkSchema, { players: "nope", totalPlayers: 1 }, "historic-bulk")).toThrow();
    expect(() => validate(fixturesSchema, { not: "a list" }, "fixtures")).toThrow();
  });

  it("[L4] a player record without ep_next or status keeps them unknown, not 0.0 points and 'available'", () => {
    const base = { teams: [], element_types: [], events: [], element_stats: [] };
    const raw = makeRawElement({ id: 7 }) as unknown as Record<string, unknown>;
    delete raw.ep_next;
    delete raw.status;
    const [el] = parseBootstrapStatic({ ...base, elements: [raw] }).bootstrap.elements;
    expect(el.ep_next).toBeUndefined();
    expect(el.status).toBeUndefined();
  });
});
