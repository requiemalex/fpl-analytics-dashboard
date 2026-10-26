import { describe, expect, it } from "vitest";
import { expectationForGameweek, upcomingGameweeks } from "./gameweekExpectations";
import type { UpcomingFixture } from "./fixtureTicker";
import type { ModelBreakdown } from "./pointsModel";

const season = (isNext: number | null, last = 38) => Array.from({ length: last }, (_, i) => ({ id: i + 1, isNext: i + 1 === isNext }));

describe("<upcoming_gameweeks> upcomingGameweeks", () => {
  it("starts at FPL's next gameweek and follows the season", () => {
    expect(upcomingGameweeks(season(1))).toEqual([1, 2, 3, 4, 5]);
    expect(upcomingGameweeks(season(9))).toEqual([9, 10, 11, 12, 13]);
  });

  it("stops at the season's last gameweek", () => {
    expect(upcomingGameweeks(season(37))).toEqual([37, 38]);
    expect(upcomingGameweeks(season(38))).toEqual([38]);
  });

  it("is empty once the last deadline has passed, or without events", () => {
    expect(upcomingGameweeks(season(null))).toEqual([]);
    expect(upcomingGameweeks([])).toEqual([]);
  });
});

const fixture = (fixtureId: number, eventId: number | null): UpcomingFixture => ({ fixtureId, eventId, opponentTeamId: 2, opponentShortName: "BUR", isHome: true, difficulty: 3 });
const breakdown = (total: number, expectedMinutes = 80) => ({ total, expectedMinutes }) as ModelBreakdown;

describe("expectationForGameweek", () => {
  // GW9 blank, GW10 a double, GW11 single.
  const upcoming = [fixture(1, 10), fixture(2, 10), fixture(3, 11)];
  const fplFor = (_f: UpcomingFixture, index: number) => [5, 4, 3][index];
  const modelFor = (f: UpcomingFixture) => breakdown(f.fixtureId);

  it("adds up a double gameweek's matches, each worked out by its place in his upcoming list", () => {
    const gw = expectationForGameweek(upcoming, 10, fplFor, modelFor);
    expect(gw.fixtures.map((f) => f.fixtureId)).toEqual([1, 2]);
    expect(gw.fpl).toBe(9);
    expect(gw.model).toBe(3);
    expect(gw.modelBreakdowns).toHaveLength(2);
    expect(expectationForGameweek(upcoming, 11, fplFor, modelFor).fpl).toBe(3);
  });

  it("<expected_minutes>: adds up the Model's expected minutes for a double gameweek's matches", () => {
    const gw = expectationForGameweek(upcoming, 10, fplFor, (f) => breakdown(1, f.fixtureId === 1 ? 85 : 70));
    expect(gw.expectedMinutes).toBe(155);
    expect(expectationForGameweek(upcoming, 11, fplFor, (f) => breakdown(1, 64)).expectedMinutes).toBe(64);
  });

  it("gives a blank gameweek no matches and no figure", () => {
    expect(expectationForGameweek(upcoming, 9, fplFor, modelFor)).toEqual({ eventId: 9, fixtures: [], fpl: null, modelBreakdowns: null, model: null, expectedMinutes: null });
  });

  it("has no figure when any of his matches lacks one", () => {
    const gw = expectationForGameweek(upcoming, 10, (_f, i) => (i === 1 ? null : 1), (f) => (f.fixtureId === 2 ? null : breakdown(1)));
    expect(gw.fpl).toBeNull();
    expect(gw.model).toBeNull();
    expect(gw.expectedMinutes).toBeNull();
    expect(gw.fixtures).toHaveLength(2);
  });
});
