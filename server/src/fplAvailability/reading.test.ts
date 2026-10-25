import { describe, expect, it } from "vitest";
import { availabilityReading, formatReading, readingChanged, readingPath } from "./reading.js";

const bootstrap = (over: { nextDeadline?: string | null; elements?: unknown[] } = {}) => ({
  events: [
    { id: 1, deadline_time: "2026-08-21T17:30:00Z", is_next: false },
    { id: 9, deadline_time: "2026-10-31T11:00:00Z", is_next: over.nextDeadline !== null },
    { id: 10, deadline_time: "2026-11-07T11:00:00Z", is_next: false },
  ].map((e) => (e.id === 9 && over.nextDeadline ? { ...e, deadline_time: over.nextDeadline } : e)),
  elements: over.elements ?? [
    { id: 5, code: 500, status: "a", chance_of_playing_next_round: null, chance_of_playing_this_round: null, news: "", news_added: null },
    { id: 7, code: 700, status: "i", chance_of_playing_next_round: 0, chance_of_playing_this_round: 0, news: "Hamstring injury - Expected back 15 Nov", news_added: "2026-10-24T09:00:00Z" },
    { id: 3, code: 300, status: "d", chance_of_playing_next_round: 75, chance_of_playing_this_round: 50, news: "Knock - 75% chance of playing", news_added: "2026-10-25T10:00:00Z" },
    { id: 4, code: 400, status: "a", chance_of_playing_next_round: 100, chance_of_playing_this_round: 100, news: "", news_added: "2026-10-01T10:00:00Z" },
  ],
});
const NOW = new Date("2026-10-26T12:00:00Z");

describe("FPL availability record (<availability_record>)", () => {
  it("takes the next deadline's reading: everyone with news, by code; the available-with-no-news left out", () => {
    const r = availabilityReading(bootstrap(), NOW)!;
    expect(r).toMatchObject({ season: "2026/27", gameweek: 9, deadline: "2026-10-31T11:00:00Z", recordedAt: NOW.toISOString(), pool: 4 });
    expect(r.players.map((p) => p.code)).toEqual([300, 400, 700]);
    expect(r.players[0]).toEqual({ code: 300, element: 3, status: "d", chanceNextRound: 75, chanceThisRound: 50, news: "Knock - 75% chance of playing", newsAdded: "2026-10-25T10:00:00Z" });
  });
  it("nothing once the deadline has passed, with no next gameweek, or no players", () => {
    expect(availabilityReading(bootstrap({ nextDeadline: "2026-10-26T11:59:00Z" }), NOW)).toBeNull();
    expect(availabilityReading(bootstrap({ nextDeadline: null }), NOW)).toBeNull();
    expect(availabilityReading(bootstrap({ elements: [] }), NOW)).toBeNull();
  });
  it("a missing chance is unknown, never 0", () => {
    const r = availabilityReading(bootstrap({ elements: [{ id: 1, code: 10, status: "d", news: "Ill" }] }), NOW)!;
    expect(r.players[0]).toMatchObject({ chanceNextRound: null, chanceThisRound: null, newsAdded: null });
  });
  it("changed only when the news is: the time taken doesn't count", () => {
    const a = availabilityReading(bootstrap(), NOW)!;
    const later = availabilityReading(bootstrap(), new Date("2026-10-27T12:00:00Z"))!;
    expect(readingChanged(null, a)).toBe(true);
    expect(readingChanged(a, later)).toBe(false);
    const els = bootstrap().elements as { news: string }[];
    els[1] = { ...els[1], news: "Hamstring injury - Expected back 22 Nov" };
    expect(readingChanged(a, availabilityReading(bootstrap({ elements: els }), NOW)!)).toBe(true);
  });
  it("one file per gameweek, one player per line, and it reads back as written", () => {
    const r = availabilityReading(bootstrap(), NOW)!;
    expect(readingPath(r)).toBe("data/fpl-availability/2026-27/gw09.json");
    const text = formatReading(r);
    expect(JSON.parse(text)).toEqual(r);
    expect(text.split("\n").filter((l) => l.includes('"code"'))).toHaveLength(3);
    const empty = { ...r, players: [] };
    expect(JSON.parse(formatReading(empty))).toEqual(empty);
  });
});
