import { describe, it, expect } from "vitest";
import { normalizePlayers } from "./normalizePlayers";
import { makeRawElement, makeRawTeam, RAW_ELEMENT_TYPES } from "../test/rawFixtures";
import type { RawBootstrapStatic } from "../types/raw";

function makeBootstrap(overrides: Partial<RawBootstrapStatic> = {}): RawBootstrapStatic {
  return {
    elements: [],
    teams: [makeRawTeam({ id: 1 })],
    element_types: RAW_ELEMENT_TYPES,
    events: [],
    element_stats: [],
    ...overrides,
  };
}

describe("normalizePlayers — now_cost unit conversion", () => {
  it("<price>: converts now_cost from £0.1m units to £millions by dividing by 10, never treating 100 as £100m", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, now_cost: 100 })] });
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].price).toBe(10); // £10m, not £100m
  });

  it("handles a realistic fractional price (e.g. 55 -> £5.5m)", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, now_cost: 55 })] });
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].price).toBe(5.5);
  });
});

describe("normalizePlayers — structurally broken records", () => {
  it("skips (excludes, never guesses) a player with an unknown element_type id", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, element_type: 999 })] });
    const result = normalizePlayers(bootstrap);
    expect(result.players).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("skips a player whose team id doesn't exist in the teams list", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, team: 999 })] });
    const result = normalizePlayers(bootstrap);
    expect(result.players).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("normalizes valid players alongside skipped ones without cross-contaminating counts", () => {
    const bootstrap = makeBootstrap({
      elements: [makeRawElement({ id: 1 }), makeRawElement({ id: 2, team: 999 }), makeRawElement({ id: 3 })],
    });
    const result = normalizePlayers(bootstrap);
    expect(result.players).toHaveLength(2);
    expect(result.skippedCount).toBe(1);
    expect(result.players.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe("normalizePlayers — availability-gated advanced fields", () => {
  it("leaves an advanced field null when it's absent from the whole element list (never a fabricated 0)", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1 })] }); // no expected_goals anywhere
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].xG).toBeNull();
    expect(players[0].defensiveContributions).toBeNull();
    expect(players[0].starts).toBeNull();
  });

  it("parses and surfaces an advanced field once detected as available", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, expected_goals: "4.75", defensive_contribution: 12, starts: 8 })] });
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].xG).toBe(4.75);
    expect(players[0].defensiveContributions).toBe(12);
    expect(players[0].starts).toBe(8);
  });

  it("never lets a malformed numeric string reach the UI as NaN — parses to null instead", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, expected_goals: "not-a-number" })] });
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].xG).toBeNull();
    expect(Number.isNaN(players[0].xG)).toBe(false);
  });
});

describe("normalizePlayers — per-game placeholders", () => {
  it("always sets xGPerGame/xAPerGame/etc. and savesPerGame to null on the raw normalized player — resolvePlayerStats.ts is the only place that fills them", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1, expected_goals: "5.0" })] });
    const { players } = normalizePlayers(bootstrap);
    expect(players[0].xGPerGame).toBeNull();
    expect(players[0].savesPerGame).toBeNull();
  });
});

describe("normalizePlayers — total player count", () => {
  it("carries through bootstrap total_players when present", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1 })], total_players: 9_000_000 });
    const result = normalizePlayers(bootstrap);
    expect(result.totalPlayers).toBe(9_000_000);
  });

  it("is null, not 0 or undefined, when total_players is absent", () => {
    const bootstrap = makeBootstrap({ elements: [makeRawElement({ id: 1 })] });
    const result = normalizePlayers(bootstrap);
    expect(result.totalPlayers).toBeNull();
  });
});
