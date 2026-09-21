import { describe, it, expect } from "vitest";
import { deriveGameweekState, normalizeEvents } from "./gameweek";
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
    });
  });
});
