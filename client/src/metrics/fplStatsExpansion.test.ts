import { describe, it, expect } from "vitest";
import { normalizePlayers } from "../normalize/normalizePlayers";
import { normalizeSeasonHistory } from "../normalize/normalizeElementSummary";
import { resolvePlayerStats } from "./resolvePlayerStats";
import { computeCareerAverages } from "./careerMetrics";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { PLAYER_COLUMNS, columnByKey, isStaticColumn, rankValue } from "../components/playerColumns";
import { METRIC_DICTIONARY } from "./dictionary";
import { makePlayer } from "../test/fixtures";
import { makeRawElement, makeRawTeam, RAW_ELEMENT_TYPES } from "../test/rawFixtures";
import type { RawBootstrapStatic, RawElementSummary } from "../types/raw";
import type { PlayerDerivedMetrics } from "./playerMetrics";

// FPL figures the API serves that the Explorers now show: saves, penalties
// saved, goals conceded, cards, ICT's three parts, DC's three parts, form
// and the set-piece orders. Shapes and values from the live API, 18 Oct 2026.

const NO_DERIVED = {} as PlayerDerivedMetrics;

describe("live bootstrap fields", () => {
  // Haaland, element 411, as served on 2026-10-18.
  const raw = {
    elements: [
      makeRawElement({
        id: 411,
        element_type: 4,
        minutes: 619,
        yellow_cards: 0,
        red_cards: 0,
        penalties_saved: 0,
        influence: "221.8",
        creativity: "24.1",
        threat: "279.0",
        tackles: 1,
        clearances_blocks_interceptions: 12,
        recoveries: 14,
        penalties_order: 1,
        direct_freekicks_order: null,
        corners_and_indirect_freekicks_order: null,
      }),
      makeRawElement({ id: 2 }),
    ],
    teams: [makeRawTeam({ id: 1 })],
    element_types: RAW_ELEMENT_TYPES,
    events: [],
    element_stats: [],
  } as RawBootstrapStatic;
  const [haaland, other] = normalizePlayers(raw).players;

  it("reads each figure, ICT's parts parsed from strings", () => {
    expect(haaland).toMatchObject({ influence: 221.8, creativity: 24.1, threat: 279, tackles: 1, clearancesBlocksInterceptions: 12, recoveries: 14, yellowCards: 0, penaltiesOrder: 1 });
  });
  it("a field FPL doesn't send, or sends as null, is null (—), never 0", () => {
    expect(haaland.directFreekicksOrder).toBeNull();
    expect(other).toMatchObject({ yellowCards: null, influence: null, tackles: null, penaltiesOrder: null });
  });
});

describe("history_past", () => {
  // Gabriel, element 4: DC is tracked from 2024/25, its parts only from 2025/26.
  const row = (season_name: string, extra: object) => ({
    season_name, total_points: 100, minutes: 2750, goals_scored: 0, assists: 0, clean_sheets: 10, goals_conceded: 30, bonus: 10, bps: 500,
    saves: 0, penalties_saved: 0, yellow_cards: 4, red_cards: 0, influence: "824.0", creativity: "128.5", threat: "298.0", ict_index: "125.0",
    ...extra,
  });
  const raw = {
    history: [],
    history_past: [
      row("2024/25", { defensive_contribution: 159, clearances_blocks_interceptions: 0, recoveries: 0, tackles: 0 }),
      row("2025/26", { defensive_contribution: 277, clearances_blocks_interceptions: 239, recoveries: 64, tackles: 38 }),
      { season_name: "2023/24", total_points: 90, minutes: 3000 },
    ],
  } as unknown as RawElementSummary;
  const seasons = normalizeSeasonHistory(raw);
  const bySeason = (name: string) => seasons.find((s) => s.seasonName === name)!;

  it("DC's parts are real from 2025/26 and add up to DC there (a defender: CBI + tackles)", () => {
    const s = bySeason("2025/26");
    expect(s).toMatchObject({ tackles: 38, clearancesBlocksInterceptions: 239, recoveries: 64 });
    expect(s.clearancesBlocksInterceptions! + s.tackles!).toBe(s.defensiveContribution);
  });
  it("before 2025/26 DC's parts are FPL's placeholder 0, so null — while DC itself is real", () => {
    expect(bySeason("2024/25")).toMatchObject({ tackles: null, clearancesBlocksInterceptions: null, recoveries: null, defensiveContribution: 159 });
  });
  it("saves, cards and ICT's parts are read for every season", () => {
    expect(bySeason("2024/25")).toMatchObject({ saves: 0, yellowCards: 4, redCards: 0, penaltiesSaved: 0, influence: 824, creativity: 128.5, threat: 298 });
  });
  it("a season whose row omits a field has it null, never 0", () => {
    expect(bySeason("2023/24")).toMatchObject({ saves: null, yellowCards: null, influence: null, tackles: null });
  });
});

describe("per Data View", () => {
  const live = makePlayer({
    id: 1, position: "DEF", minutes: 450, goalsConceded: 6, yellowCards: 2, redCards: 0, influence: 120, creativity: 30, threat: 40,
    tackles: 8, clearancesBlocksInterceptions: 40, recoveries: 12, penaltiesSaved: 0, form: 5.5, penaltiesOrder: 2, directFreekicksOrder: null, cornersOrder: 3,
  });
  const s1 = normalizeSeasonHistory({
    history: [],
    history_past: [
      { season_name: "2024/25", total_points: 120, minutes: 2363, goals_scored: 0, assists: 0, clean_sheets: 10, goals_conceded: 25, bonus: 10, bps: 500, yellow_cards: 4, red_cards: 0, saves: 0, penalties_saved: 0, influence: "584.6", creativity: "208.8", threat: "287.0", defensive_contribution: 159, tackles: 0, clearances_blocks_interceptions: 0, recoveries: 0 },
      { season_name: "2025/26", total_points: 150, minutes: 2750, goals_scored: 0, assists: 0, clean_sheets: 12, goals_conceded: 30, bonus: 12, bps: 600, yellow_cards: 4, red_cards: 0, saves: 0, penalties_saved: 0, influence: "824.0", creativity: "128.5", threat: "298.0", defensive_contribution: 277, tackles: 38, clearances_blocks_interceptions: 239, recoveries: 64 },
    ],
  } as unknown as RawElementSummary);
  const avg = computeCareerAverages(s1);
  const profile: HistoricPlayerProfile = { lastCompletedSeason: s1[1], qualifyingSeasons: s1, allSeasonsInWindow: s1, floorSeasonsInWindow: s1, floorWindowAverage: avg };

  it("Current Season: the live figures; GC/Game from the live totals", () => {
    const r = resolvePlayerStats(live, "live", undefined, true);
    expect(r).toMatchObject({ goalsConceded: 6, goalsConcededPerGame: 6 / 5, yellowCards: 2, tackles: 8 });
  });
  it("before a ball is kicked: nobody has played, so every figure is — (null), never FPL's carried-over totals", () => {
    const r = resolvePlayerStats(live, "live", undefined, false);
    expect(r).toMatchObject({ yellowCards: null, redCards: null, influence: null, creativity: null, threat: null, tackles: null, clearancesBlocksInterceptions: null, recoveries: null, penaltiesSaved: null });
    expect(r.goalsConcededPerGame).toBeNull();
  });
  it("Last Completed Season: that season's own figures", () => {
    const r = resolvePlayerStats(live, "lastSeason", profile, true);
    expect(r).toMatchObject({ yellowCards: 4, influence: 824, tackles: 38, clearancesBlocksInterceptions: 239, recoveries: 64 });
    expect(r.goalsConcededPerGame).toBeCloseTo(30 / 31, 10);
  });
  it("Historic Average: per season, and DC's parts only over the seasons FPL tracked them (not diluted by 2024/25's placeholder)", () => {
    const r = resolvePlayerStats(live, "historicAverage", profile, true);
    expect(r.yellowCards).toBe(4);
    expect(r.influence).toBeCloseTo((584.6 + 824) / 2, 10);
    expect(r.tackles).toBe(38);
    expect(r.recoveries).toBe(64);
    // GC/Game is total GC / games from the same seasons' total minutes (2363 + 2750 = 5113 -> 57 games).
    expect(r.goalsConcededPerGame).toBeCloseTo(55 / 57, 10);
  });
  it("form and the set-piece orders are today's figures in every view, even with no history and pre-season", () => {
    for (const r of [resolvePlayerStats(live, "lastSeason", undefined, true), resolvePlayerStats(live, "historicAverage", profile, true), resolvePlayerStats(live, "live", undefined, false)]) {
      expect(r).toMatchObject({ form: 5.5, penaltiesOrder: 2, directFreekicksOrder: null, cornersOrder: 3 });
    }
  });
  it("no history: every new performance figure is —", () => {
    expect(resolvePlayerStats(live, "lastSeason", undefined, true)).toMatchObject({ yellowCards: null, influence: null, tackles: null, goalsConcededPerGame: null, saves: null });
  });
});

describe("the columns", () => {
  it("every Player column has a metric definition (the User Guide's Metric reference)", () => {
    for (const c of PLAYER_COLUMNS) expect(METRIC_DICTIONARY[c.metricKey ?? c.key], c.key).toBeDefined();
  });
  it("form and the set-piece orders are 'always live'; the rest follow the Data View", () => {
    for (const key of ["form", "penaltiesOrder", "directFreekicksOrder", "cornersOrder"]) expect(isStaticColumn(columnByKey(key)!), key).toBe(true);
    for (const key of ["saves", "savesPerGame", "penaltiesSaved", "goalsConceded", "goalsConcededPerGame", "yellowCards", "redCards", "influence", "creativity", "threat", "tackles", "clearancesBlocksInterceptions", "recoveries"]) {
      expect(isStaticColumn(columnByKey(key)!), key).toBe(false);
    }
  });
  it("lower-is-better totals that grow with minutes rank per game (audit 2026-10-18 M13): a 90-minute cameo doesn't out-rank a regular", () => {
    const regular = resolvePlayerStats(makePlayer({ id: 1, position: "DEF", minutes: 900, goalsConceded: 10, yellowCards: 2 }), "live", undefined, true);
    const cameo = resolvePlayerStats(makePlayer({ id: 2, position: "DEF", minutes: 90, goalsConceded: 3, yellowCards: 1 }), "live", undefined, true);
    for (const key of ["goalsConceded", "yellowCards"]) {
      const c = columnByKey(key)!;
      expect(c.higherIsBetter).toBe(false);
      expect(rankValue(c, regular, NO_DERIVED)!, key).toBeLessThan(rankValue(c, cameo, NO_DERIVED)!);
    }
  });
});
