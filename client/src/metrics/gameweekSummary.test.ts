import { describe, it, expect } from "vitest";
import { chipStandings, pointsAgainstGameweek, rankPercentile } from "./gameweekSummary";
import type { ChipWindow, EventSummary, NormalizedEvent } from "../types/normalized";

// <gameweek_summary>

const event = (id: number, summary?: Partial<EventSummary>): NormalizedEvent => ({
  id,
  name: `Gameweek ${id}`,
  deadlineTime: "2026-10-01T00:00:00Z",
  finished: true,
  isCurrent: false,
  isNext: false,
  isPrevious: false,
  summary: summary && { averageScore: 50, highestScore: 120, rankedCount: 1000, mostCaptainedId: null, mostViceCaptainedId: null, topScorer: null, chipPlays: {}, ...summary },
});

const windows: ChipWindow[] = [
  { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
  { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
  { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
  { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
];

describe("chipStandings", () => {
  it("counts every play since the chip's window opened against the managers ranked this gameweek", () => {
    const events = [event(1, { chipPlays: { bboost: 100, wildcard: 999 } }), event(2, { chipPlays: { bboost: 50, wildcard: 200 } }), event(3, { rankedCount: 2000, chipPlays: { wildcard: 100 } })];
    const byChip = Object.fromEntries(chipStandings(3, events, windows).map((s) => [s.chip, s]));
    // Bench Boost: 150 played over GW1–3 of 2000 managers.
    expect(byChip.bboost).toEqual({ chip: "bboost", inWindow: true, playedThisWeek: 0, shareThisWeek: 0, stillToPlay: 1 - 150 / 2000 });
    // Wildcard's window opens at GW2: GW1's plays (from a previous rule) don't count.
    expect(byChip.wildcard.stillToPlay).toBe(1 - 300 / 2000);
    expect(byChip.wildcard.shareThisWeek).toBe(100 / 2000);
  });

  it("a chip outside its windows can't be played, and missing figures stay unknown", () => {
    expect(chipStandings(1, [event(1, {})], windows).find((s) => s.chip === "wildcard")!.inWindow).toBe(false);
    const unknown = chipStandings(2, [event(1), event(2, {})], windows).find((s) => s.chip === "bboost")!;
    expect(unknown.stillToPlay).toBeNull();
    expect(unknown.playedThisWeek).toBe(0);
  });
});

describe("pointsAgainstGameweek (<gameweek_points_colour>)", () => {
  it("is neutral at the average, full green at the highest, full red at 0", () => {
    expect(pointsAgainstGameweek(50, 50, 120)).toBe(50);
    expect(pointsAgainstGameweek(120, 50, 120)).toBe(100);
    expect(pointsAgainstGameweek(85, 50, 120)).toBe(75);
    expect(pointsAgainstGameweek(25, 50, 120)).toBe(25);
    expect(pointsAgainstGameweek(0, 50, 120)).toBe(0);
    expect(pointsAgainstGameweek(-4, 50, 120)).toBe(0);
  });
  it("has no colour without FPL's average and highest", () => {
    expect(pointsAgainstGameweek(60, null, 120)).toBeNull();
    expect(pointsAgainstGameweek(60, 50, null)).toBeNull();
  });
});

describe("rankPercentile", () => {
  it("puts the top rank at 100 and the last near 0", () => {
    expect(rankPercentile(1, 1000)).toBe(100);
    expect(rankPercentile(501, 1000)).toBe(50);
    expect(rankPercentile(null, 1000)).toBeNull();
  });
});
