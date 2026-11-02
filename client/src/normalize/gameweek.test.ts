import { describe, it, expect } from "vitest";
import { deriveGameweekState, normalizeEvents, seasonHasStarted } from "./gameweek";
import type { RawEvent } from "../types/raw";

function makeEvent(overrides: Partial<RawEvent> & { id: number }): RawEvent {
  return {
    name: `Gameweek ${overrides.id}`,
    deadline_time: "2026-01-01T00:00:00Z",
    finished: false,
    is_previous: false,
    is_current: false,
    is_next: false,
    data_checked: false,
    ...overrides,
  };
}

describe("deriveGameweekState — events.is_current handling", () => {
  it("returns 'current' for the event with is_current true", () => {
    const events = [makeEvent({ id: 1, finished: true }), makeEvent({ id: 2, is_current: true }), makeEvent({ id: 3, is_next: true })];
    const state = deriveGameweekState(events);
    expect(state.kind).toBe("current");
    if (state.kind === "current") expect(state.event.id).toBe(2);
  });

  it("a completed gameweek is never labelled current, even if it happens to be first in the array (finished, no is_current anywhere)", () => {
    const events = [makeEvent({ id: 1, finished: true }), makeEvent({ id: 2, finished: true })];
    const state = deriveGameweekState(events);
    expect(state.kind).not.toBe("current");
  });

  it("<fallback>: with no current event, falls back to the most recently completed gameweek (highest id among finished)", () => {
    const events = [makeEvent({ id: 1, finished: true }), makeEvent({ id: 2, finished: true }), makeEvent({ id: 3, finished: false })];
    const state = deriveGameweekState(events);
    expect(state.kind).toBe("last-completed");
    if (state.kind === "last-completed") expect(state.event.id).toBe(2);
  });

  it("<fallback>: uses id, not array order, to determine 'most recent' among finished events", () => {
    // Deliberately out of order in the input array.
    const events = [makeEvent({ id: 3, finished: true }), makeEvent({ id: 1, finished: true }), makeEvent({ id: 2, finished: true })];
    const state = deriveGameweekState(events);
    expect(state.kind).toBe("last-completed");
    if (state.kind === "last-completed") expect(state.event.id).toBe(3);
  });

  it("<fallback>: pre-season — no current and no finished events at all", () => {
    const events = [makeEvent({ id: 1 }), makeEvent({ id: 2, is_next: true })];
    const state = deriveGameweekState(events);
    expect(state.kind).toBe("pre-season");
  });

  it("pre-season for a totally empty events list", () => {
    const state = deriveGameweekState([]);
    expect(state.kind).toBe("pre-season");
  });

  it("is_current always wins over any finished events, even if there are many completed gameweeks", () => {
    const events = [makeEvent({ id: 1, finished: true }), makeEvent({ id: 2, finished: true }), makeEvent({ id: 3, finished: true }), makeEvent({ id: 4, is_current: true })];
    const state = deriveGameweekState(events);
    expect(state.kind).toBe("current");
    if (state.kind === "current") expect(state.event.id).toBe(4);
  });
});

describe("normalizeEvents", () => {
  it("maps every raw field to its normalized camelCase equivalent", () => {
    const raw = makeEvent({ id: 5, is_current: true, is_next: false, is_previous: true, finished: true, deadline_time: "2026-05-01T18:30:00Z" });
    const [normalized] = normalizeEvents([raw]);
    expect(normalized).toEqual({
      id: 5,
      name: "Gameweek 5",
      deadlineTime: "2026-05-01T18:30:00Z",
      finished: true,
      isCurrent: true,
      isNext: false,
      isPrevious: true,
      // FPL hasn't sent this gameweek's figures for every manager: each unknown.
      summary: { averageScore: null, highestScore: null, rankedCount: null, mostCaptainedId: null, mostViceCaptainedId: null, topScorer: null, chipPlays: {} },
    });
  });

  it("<gameweek_summary> reads FPL's figures for every manager, keeping only the chips it knows", () => {
    const raw = {
      ...makeEvent({ id: 9 }),
      average_entry_score: 42,
      highest_score: 123,
      ranked_count: 11162055,
      most_captained: 411,
      most_vice_captained: 1,
      top_element_info: { id: 112, points: 15 },
      chip_plays: [
        { chip_name: "bboost", num_played: 107179 },
        { chip_name: "wildcard", num_played: 333085 },
        { chip_name: "newchip", num_played: 5 },
      ],
    };
    expect(normalizeEvents([raw])[0].summary).toEqual({
      averageScore: 42,
      highestScore: 123,
      rankedCount: 11162055,
      mostCaptainedId: 411,
      mostViceCaptainedId: 1,
      topScorer: { id: 112, points: 15 },
      chipPlays: { bboost: 107179, wildcard: 333085 },
    });
  });
});

describe("seasonHasStarted (audit 2026-09-25 player-team-profiles R3)", () => {
  const events = (finished: boolean[]) => normalizeEvents(finished.map((f, i) => makeEvent({ id: i + 1, finished: f })));

  it("is true once any fixture has finished", () => {
    expect(seasonHasStarted([{ finished: false }, { finished: true }], events([false, false]))).toBe(true);
  });

  it("is true once a gameweek has finished, even with no fixtures loaded (a failed fixtures request)", () => {
    expect(seasonHasStarted([], events([true, false]))).toBe(true);
  });

  it("is false pre-season", () => {
    expect(seasonHasStarted([{ finished: false }], events([false, false]))).toBe(false);
    expect(seasonHasStarted([], [])).toBe(false);
  });
});
