import { describe, it, expect } from "vitest";
import { computeBlendedMinutesReliability } from "./minutesReliabilityBlend";
import { makePlayer, makeTeam, makeSeason } from "../test/fixtures";
import type { HistoricPlayerProfile } from "./historicAnalysis";

const FULL_SEASON_MINUTES = 38 * 90; // 3420, documented in minutesReliabilityBlend.ts

function profileWithSeasons(minutesList: number[]): HistoricPlayerProfile {
  const seasons = minutesList.map((m, i) => makeSeason({ seasonName: `${2020 + i}/${(21 + i) % 100}`, minutes: m }));
  return { lastCompletedSeason: seasons.at(-1) ?? null, qualifyingSeasons: seasons, allSeasonsInWindow: seasons, floorSeasonsInWindow: [], floorWindowAverage: null };
}

describe("computeBlendedMinutesReliability", () => {
  // Audit 2026-10-18 M12 (owner's decision): ownership no longer enters the
  // blend, so this hand computation loses its old 15% ownership step.
  it("full pipeline, hand-computed: current+historic blend and availability multiplier composed correctly", () => {
    // current = min(1, 450/(8*90)) = 0.625
    // historic (1 full season) = 1 (weightedMean of single season, no consistency discount)
    // currentWeight = min(1, 8/8) = 1 -> playingTimeBase = 1*0.625 + 0*1 = 0.625
    // availabilityModifier: status "a", chanceOfPlayingNextRound null -> 1
    // final = 0.625 * 1 = 0.625
    const player = makePlayer({ id: 1, position: "MID", minutes: 450, ownership: 20, status: "a", chanceOfPlayingNextRound: null });
    const team = makeTeam({ id: 1, played: 8 });
    const profile = profileWithSeasons([FULL_SEASON_MINUTES]);
    const result = computeBlendedMinutesReliability(player, team, profile);
    expect(result.currentWeight).toBe(1);
    expect(result.value).toBeCloseTo(0.625, 10);
  });

  it("ownership has no effect: a 0.6%-owned and a 60%-owned player with the same minutes record get the same reliability (audit 2026-10-18 M12)", () => {
    const team = makeTeam({ id: 1, played: 8 });
    const profile = profileWithSeasons([FULL_SEASON_MINUTES, FULL_SEASON_MINUTES]);
    const low = computeBlendedMinutesReliability(makePlayer({ id: 1, position: "DEF", minutes: 720, ownership: 0.6 }), team, profile).value;
    const high = computeBlendedMinutesReliability(makePlayer({ id: 2, position: "DEF", minutes: 720, ownership: 60 }), team, profile).value;
    expect(low).toBeCloseTo(1, 10);
    expect(high).toBeCloseTo(1, 10);
  });

  it("<reliability_bug_fix>: a two-season record with one full and one half season applies recency weighting + consistency discount as documented", () => {
    // shares = [0.5, 1.0], weights = [1,2] (oldest=1, newest=2), totalWeight=3
    // weightedMean = (0.5*1 + 1.0*2)/3 = 0.833333...
    // mean=0.75, variance=0.0625, stdev=0.25, consistency = 1 - 0.25/0.5 = 0.5
    // result = weightedMean * (0.65 + 0.35*0.5) = weightedMean * 0.825 = 0.6875
    const profile = profileWithSeasons([FULL_SEASON_MINUTES / 2, FULL_SEASON_MINUTES]);
    // Zero current-season data (pre-season / team hasn't played) -> playingTimeBase falls back to historic alone.
    const player = makePlayer({ id: 1, position: "MID", minutes: 0, ownership: null, status: "d", chanceOfPlayingNextRound: null });
    const team = makeTeam({ id: 1, played: 0 });
    const result = computeBlendedMinutesReliability(player, team, profile);
    // playingTimeBase = historic = 0.6875 (ownership null -> blended = playingTimeBase)
    // availabilityModifier: status "d", chanceOfPlayingNextRound null -> 0.5
    expect(result.value).toBeCloseTo(0.6875 * 0.5, 10);
    expect(result.currentWeight).toBe(0);
  });

  // Audit 2026-10-18 M12: this used to fall back to ownership alone; with no
  // minutes evidence anywhere there is now no figure at all.
  it("returns null when there is no playing-time data anywhere, however widely owned (thin-data new signing case)", () => {
    const player = makePlayer({ id: 1, position: "FWD", minutes: null, ownership: 50, status: "a", chanceOfPlayingNextRound: 75 });
    const team = makeTeam({ id: 1, played: 0 }); // possible = 0 -> current null
    const profile: HistoricPlayerProfile = { lastCompletedSeason: null, qualifyingSeasons: [], allSeasonsInWindow: [], floorSeasonsInWindow: [], floorWindowAverage: null }; // historic null
    expect(computeBlendedMinutesReliability(player, team, profile).value).toBeNull();
  });

  it("returns null value when there is no playing-time data AND no ownership data at all", () => {
    const player = makePlayer({ id: 1, position: "FWD", minutes: null, ownership: null });
    const team = makeTeam({ id: 1, played: 0 });
    const profile: HistoricPlayerProfile = { lastCompletedSeason: null, qualifyingSeasons: [], allSeasonsInWindow: [], floorSeasonsInWindow: [], floorWindowAverage: null };
    const result = computeBlendedMinutesReliability(player, team, profile);
    expect(result.value).toBeNull();
  });

  it("currentWeight formula: min(1, gamesPlayed/8), reaching full trust exactly at 8 games and capping beyond", () => {
    const player = makePlayer({ id: 1, position: "MID", minutes: 100 });
    const profile = profileWithSeasons([FULL_SEASON_MINUTES]);
    expect(computeBlendedMinutesReliability(player, makeTeam({ id: 1, played: 4 }), profile).currentWeight).toBeCloseTo(0.5, 10);
    expect(computeBlendedMinutesReliability(player, makeTeam({ id: 1, played: 8 }), profile).currentWeight).toBe(1);
    expect(computeBlendedMinutesReliability(player, makeTeam({ id: 1, played: 20 }), profile).currentWeight).toBe(1); // capped, never > 1
  });

  it("availabilityModifier: an injured player with a perfect historic track record still shows near-zero reliability (status other than a/d with no chanceOfPlayingNextRound)", () => {
    const profile = profileWithSeasons([FULL_SEASON_MINUTES, FULL_SEASON_MINUTES, FULL_SEASON_MINUTES]);
    const player = makePlayer({ id: 1, position: "FWD", minutes: 2700, ownership: 40, status: "i", chanceOfPlayingNextRound: null });
    const team = makeTeam({ id: 1, played: 30 });
    const result = computeBlendedMinutesReliability(player, team, profile);
    expect(result.value).toBe(0); // multiplied by availabilityModifier 0
  });

  it("chanceOfPlayingNextRound, when FPL publishes one, always overrides the coarser status-based default", () => {
    const profile = profileWithSeasons([FULL_SEASON_MINUTES]);
    const player = makePlayer({ id: 1, position: "MID", minutes: 900, ownership: null, status: "a", chanceOfPlayingNextRound: 25 });
    const team = makeTeam({ id: 1, played: 10 });
    const withDoubt = computeBlendedMinutesReliability(player, team, profile).value;
    const withoutDoubt = computeBlendedMinutesReliability({ ...player, chanceOfPlayingNextRound: null }, team, profile).value;
    expect(withDoubt).not.toBeNull();
    expect(withoutDoubt).not.toBeNull();
    expect(withDoubt as number).toBeLessThan(withoutDoubt as number);
    expect(withDoubt).toBeCloseTo((withoutDoubt as number) * 0.25, 10);
  });
});

describe("unknown availability (audit 2026-10-18 L4)", () => {
  it("a missing status with no chance-of-playing gives no figure, not an 'available' one", () => {
    const profile = profileWithSeasons([FULL_SEASON_MINUTES]);
    const player = makePlayer({ id: 1, position: "MID", minutes: 900, status: "", chanceOfPlayingNextRound: null });
    expect(computeBlendedMinutesReliability(player, makeTeam({ id: 1, played: 10 }), profile).value).toBeNull();
  });
});
