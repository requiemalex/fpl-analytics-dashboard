import { describe, it, expect } from "vitest";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode } from "./resolvePlayerStats";
import { perGame } from "./calculations";
import { makePlayer, makeSeason } from "../test/fixtures";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { computeCareerAverages } from "./careerMetrics";

describe("resolvePlayerStats — live mode", () => {
  it("<live_mode_preseason_fix>: when the season hasn't started, zeroes cumulative fields (genuine zero, not null) and nulls per-game rates", () => {
    const player = makePlayer({ id: 1, position: "MID", totalPoints: 999, minutes: 999, goals: 5, xG: 3 });
    const resolved = resolvePlayerStats(player, "live", undefined, false);
    expect(resolved.totalPoints).toBe(0);
    expect(resolved.minutes).toBe(0);
    expect(resolved.goals).toBe(0);
    expect(resolved.xG).toBe(0);
    expect(resolved.pointsPerGame).toBeNull();
    expect(resolved.xGPerGame).toBeNull();
    // identity/price/ownership stay live
    expect(resolved.name).toBe(player.name);
    expect(resolved.price).toBe(player.price);
    expect(resolved.ownership).toBe(player.ownership);
  });

  it("when the season has started, computes per-game rates via this app's own perGame() from the live totals+minutes (never left null/raw)", () => {
    const player = makePlayer({ id: 1, position: "FWD", xG: 4.5, xA: 2.0, xGI: 6.5, xGC: 1.0, minutes: 270, defensiveContributions: 9, saves: 0 });
    const resolved = resolvePlayerStats(player, "live", undefined, true);
    expect(resolved.xGPerGame).toBe(perGame(4.5, 270));
    expect(resolved.xAPerGame).toBe(perGame(2.0, 270));
    expect(resolved.xGIPerGame).toBe(perGame(6.5, 270));
    expect(resolved.xGCPerGame).toBe(perGame(1.0, 270));
    expect(resolved.defensiveContributionsPerGame).toBe(perGame(9, 270));
    // live mode with season started does NOT zero totals — they pass through untouched
    expect(resolved.totalPoints).toBe(player.totalPoints);
  });
});

describe("resolvePlayerStats — PPG in Current Season (audit 2026-09-25 M4)", () => {
  it("is points per estimated game, like every other mode and per-game column — not FPL's per-appearance figure", () => {
    // Cho, GW5 2026/27: 9 points in 72 minutes over several substitute
    // appearances. FPL's own points_per_game said 2.2; 72 minutes is 1 estimated game.
    const player = makePlayer({ id: 1, position: "FWD", totalPoints: 9, minutes: 72, pointsPerGame: 2.2 });
    expect(resolvePlayerStats(player, "live", undefined, true).pointsPerGame).toBe(9);
    // Haaland-like: 39 points in 450 minutes = 5 games.
    const starter = makePlayer({ id: 2, position: "FWD", totalPoints: 39, minutes: 450, pointsPerGame: 7.8 });
    expect(resolvePlayerStats(starter, "live", undefined, true).pointsPerGame).toBe(7.8);
    // 0 minutes, 0 points is a real 0.0, as in the historic modes (<ppg_vs_per90>).
    const unused = makePlayer({ id: 3, position: "GKP", totalPoints: 0, minutes: 0 });
    expect(resolvePlayerStats(unused, "live", undefined, true).pointsPerGame).toBe(0);
  });
});

describe("resolvePlayerStats — lastSeason mode", () => {
  it("returns every performance field null (<retained_not_omitted>) when there's no lastCompletedSeason entry", () => {
    const player = makePlayer({ id: 1, position: "DEF", totalPoints: 50 });
    const profile: HistoricPlayerProfile = { lastCompletedSeason: null, qualifyingSeasons: [], windowAverage: null, allSeasonsInWindow: [] };
    const resolved = resolvePlayerStats(player, "lastSeason", profile, true);
    expect(resolved.totalPoints).toBeNull();
    expect(resolved.minutes).toBeNull();
    expect(resolved.xG).toBeNull();
    expect(hasDataForMode(resolved)).toBe(false);
    // identity/price stay live even with no historic data
    expect(resolved.name).toBe(player.name);
    expect(resolved.price).toBe(player.price);
  });

  it("uses the historic season's own totals, and this app's estimatedPointsPerGame/perGame — never FPL's raw fields", () => {
    const player = makePlayer({ id: 1, position: "MID", price: 8.5 });
    const season = makeSeason({ seasonName: "2024/25", totalPoints: 150, minutes: 2700, goals: 10, assists: 8, xG: 9.5, xA: 6.5, xGI: 16, xGC: 20, defensiveContribution: 40 });
    const profile: HistoricPlayerProfile = { lastCompletedSeason: season, qualifyingSeasons: [season], windowAverage: computeCareerAverages([season]), allSeasonsInWindow: [season] };
    const resolved = resolvePlayerStats(player, "lastSeason", profile, true);
    expect(resolved.totalPoints).toBe(150);
    expect(resolved.minutes).toBe(2700);
    expect(resolved.goals).toBe(10);
    expect(resolved.xGPerGame).toBe(perGame(9.5, 2700));
    expect(resolved.xGIPerGame).toBe(perGame(16, 2700));
    // <price_always_live>: price is NOT the historic season's price, it's today's live price
    expect(resolved.price).toBe(8.5);
  });
});

describe("resolvePlayerStats — historicAverage mode", () => {
  it("returns every performance field null when the window has no seasons at all", () => {
    const player = makePlayer({ id: 1, position: "GKP" });
    const profile: HistoricPlayerProfile = { lastCompletedSeason: null, qualifyingSeasons: [], windowAverage: null, allSeasonsInWindow: [] };
    const resolved = resolvePlayerStats(player, "historicAverage", profile, true);
    expect(hasDataForMode(resolved)).toBe(false);
  });

  it("uses windowAverage's per-season averages, defaulting count-type fields to 0 (not null) when the average itself is 0", () => {
    const player = makePlayer({ id: 1, position: "FWD" });
    const seasons = [makeSeason({ seasonName: "2023/24", totalPoints: 100, minutes: 1800, goals: 10 }), makeSeason({ seasonName: "2024/25", totalPoints: 200, minutes: 2700, goals: 20 })];
    const avg = computeCareerAverages(seasons);
    const profile: HistoricPlayerProfile = { lastCompletedSeason: seasons[1], qualifyingSeasons: seasons, windowAverage: avg, allSeasonsInWindow: seasons };
    const resolved = resolvePlayerStats(player, "historicAverage", profile, true);
    expect(resolved.totalPoints).toBe(150); // (100+200)/2
    expect(resolved.minutes).toBe(2250); // (1800+2700)/2
    expect(resolved.goals).toBe(15);
  });
});

describe("resolvePlayerStatsList", () => {
  it("<retained_not_omitted>: never drops a player, even with zero data for the selected mode", () => {
    const players = [makePlayer({ id: 1, position: "MID" }), makePlayer({ id: 2, position: "DEF" })];
    const { resolved, noDataCount } = resolvePlayerStatsList(players, "lastSeason", new Map(), true);
    expect(resolved).toHaveLength(2);
    expect(noDataCount).toBe(2);
  });

  it("counts noDataCount correctly for a mixed set (some with data, some without)", () => {
    const players = [makePlayer({ id: 1, position: "MID" }), makePlayer({ id: 2, position: "DEF" })];
    const season = makeSeason({ seasonName: "2024/25", totalPoints: 80, minutes: 1200 });
    const profiles = new Map([[1, { lastCompletedSeason: season, qualifyingSeasons: [], windowAverage: null, allSeasonsInWindow: [] } as HistoricPlayerProfile]]);
    const { resolved, noDataCount } = resolvePlayerStatsList(players, "lastSeason", profiles, true);
    expect(resolved).toHaveLength(2);
    expect(noDataCount).toBe(1); // only player 2 has no data
  });
});
