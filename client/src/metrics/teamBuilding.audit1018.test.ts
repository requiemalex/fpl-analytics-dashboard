import { describe, it, expect } from "vitest";
import { computeExpectedPointsForSingleFixture, computeExpectedPointsForWindow, fplOfficialForFixture, fplSeasonRate, FORM_SHARE } from "./expectedPoints";
import { MODEL_PARAMS } from "./pointsModelParams.generated";
import { getUpcomingFixtures, firstPickableEventId, type UpcomingFixture } from "./fixtureTicker";
import { canAddPlayer, validateSquad } from "./squadRules";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import { makePlayer, makeTeam } from "../test/fixtures";
import type { NormalizedFixture, Position } from "../types/normalized";

const fixture = (o: Partial<UpcomingFixture> = {}): UpcomingFixture => ({ fixtureId: 1, eventId: 1, opponentTeamId: 2, opponentShortName: "OPP", isHome: true, difficulty: 3, ...o });

// Model Predicted's own tests (scoring rules included) are in pointsModel.test.ts.
describe("Expected Points (FPL Official)", () => {
  const p = makePlayer({ id: 1, position: "FWD", epNext: 5, status: "a" });
  it("without a season record, every match is ep_next scaled by its own FDR, the next one included (ep_next has no fixture in it)", () => {
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 3 }), 0)).toBe(5);
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 5 }), 0)).toBeCloseTo(3.8, 10);
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 2 }), 1)).toBeCloseTo(5.6, 10);
  });
  it("null ep_next stays null, never 0", () => {
    expect(computeExpectedPointsForSingleFixture(makePlayer({ id: 2, position: "MID", epNext: null }), fixture(), 0)).toBeNull();
    expect(computeExpectedPointsForSingleFixture(makePlayer({ id: 2, position: "MID", epNext: null }), fixture(), 0, 4)).toBeNull();
    expect(computeExpectedPointsForWindow(makePlayer({ id: 2, position: "MID", epNext: null }), [fixture()], 1)).toBeNull();
  });

  it("<fpl_official> the season rate: points per match he was registered for, goals and assists moved toward xG and xA by the Model's weights", () => {
    // 32 points in 8 matches; 2 goals from 3.0 xG (MID: 5 a goal), 1 assist from 1.0 xA.
    const mid = makePlayer({ id: 3, position: "MID", totalPoints: 32, goals: 2, xG: 3, assists: 1, xA: 1 });
    expect(fplSeasonRate(mid, 8)).toBeCloseTo((32 + MODEL_PARAMS.goalXgWeight * 5 * 1) / 8, 10);
    // xG not available: his points as they are.
    expect(fplSeasonRate({ ...mid, xG: null, xA: null }, 8)).toBe(4);
    // Never below 0, and nothing before his first match or with his matches not loaded.
    expect(fplSeasonRate({ ...mid, totalPoints: 1, goals: 3, xG: 0 }, 8)).toBe(0);
    expect(fplSeasonRate(mid, 0)).toBeNull();
    expect(fplSeasonRate(mid, undefined)).toBeNull();
  });

  it("<fpl_official> blends form (ep_next) with his season, form counting less the further ahead, then scales by the fixture", () => {
    // Form 1.3, season 4.0 a match: next match 20% form, then 15%, then 10% for every match after.
    const mid = makePlayer({ id: 4, position: "MID", epNext: 1.3, status: "a" });
    expect(FORM_SHARE).toEqual([0.2, 0.15, 0.1]);
    expect(computeExpectedPointsForSingleFixture(mid, fixture(), 0, 4)).toBeCloseTo(0.2 * 1.3 + 0.8 * 4, 10);
    expect(computeExpectedPointsForSingleFixture(mid, fixture(), 1, 4)).toBeCloseTo(0.15 * 1.3 + 0.85 * 4, 10);
    expect(computeExpectedPointsForSingleFixture(mid, fixture(), 4, 4)).toBeCloseTo(0.1 * 1.3 + 0.9 * 4, 10);
    expect(computeExpectedPointsForSingleFixture(mid, fixture({ difficulty: 2 }), 0, 4)).toBeCloseTo((0.2 * 1.3 + 0.8 * 4) * 1.1, 10);
  });

  it("<fpl_official> FPL's chance of playing scales the season part (ep_next already carries it); unknown availability falls back to ep_next", () => {
    // 75% chance: FPL's ep_next is already form × 0.75.
    const doubt = makePlayer({ id: 5, position: "MID", epNext: 3, status: "d", chanceOfPlayingNextRound: 75 });
    expect(computeExpectedPointsForSingleFixture(doubt, fixture(), 0, 4)).toBeCloseTo(0.2 * 3 + 0.8 * 4 * 0.75, 10);
    const out = makePlayer({ id: 6, position: "MID", epNext: 0, status: "i", chanceOfPlayingNextRound: 0 });
    expect(computeExpectedPointsForSingleFixture(out, fixture(), 3, 5)).toBe(0);
    const unknown = makePlayer({ id: 7, position: "MID", epNext: 2, status: "", chanceOfPlayingNextRound: null });
    expect(fplOfficialForFixture(unknown, fixture(), 0, 4)).toMatchObject({ total: 2, seasonRate: null, formShare: 1 });
  });
});

describe("Upcoming fixtures (GW+1..GW+5 navigator)", () => {
  const f = (o: Partial<NormalizedFixture>): NormalizedFixture =>
    ({ id: 1, eventId: 7, homeTeamId: 1, awayTeamId: 2, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 3, ...o }) as NormalizedFixture;
  const teams = new Map([1, 2, 3].map((id) => [id, makeTeam({ id })]));

  // Phase 2: the played fixture now carries `started: true`, the FPL field
  // its own comment describes (NormalizedFixture gained `started` for H1).
  it("[TB-1] a match that has already been played (scored, not yet marked finished) is not the next fixture", () => {
    const fixtures = [
      f({ id: 62, eventId: 7, homeScore: 1, awayScore: 2, kickoffTime: "2026-10-17T14:00:00Z", started: true }), // FPL: started, finished_provisional, finished=false
      f({ id: 71, eventId: 8, homeTeamId: 3, awayTeamId: 1, kickoffTime: "2026-10-24T14:00:00Z" }),
    ];
    expect(getUpcomingFixtures(1, fixtures, teams)[0].fixtureId).toBe(71);
  });
  it("[TB-1] Team Building's GW+1 is the is_next gameweek, even for a club whose current-gameweek match hasn't kicked off", () => {
    const fixtures = [
      f({ id: 69, eventId: 7, kickoffTime: "2026-10-18T15:30:00Z" }), // GW7, after GW7's deadline: no longer pickable
      f({ id: 71, eventId: 8, homeTeamId: 3, awayTeamId: 1, kickoffTime: "2026-10-24T14:00:00Z" }),
      f({ id: 80, eventId: null, homeTeamId: 1, awayTeamId: 3, kickoffTime: null }), // postponed, no gameweek yet
    ];
    const events = [6, 7, 8, 9].map((id) => ({ id, isNext: id === 8 }));
    const from = firstPickableEventId(events);
    expect(from).toBe(8);
    expect(getUpcomingFixtures(1, fixtures, teams, 5, from).map((x) => x.fixtureId)).toEqual([71]);
    // The Explorers' Next 5 Fixtures keep every match not yet kicked off.
    expect(getUpcomingFixtures(1, fixtures, teams).map((x) => x.fixtureId)).toContain(69);
  });
  it("[TB-1] with no next gameweek (season over) nothing is pickable; with no events loaded only the kick-off rule applies", () => {
    expect(firstPickableEventId([{ id: 38, isNext: false }])).toBe(39);
    expect(firstPickableEventId([])).toBeNull();
  });
});

describe("Squad rules", () => {
  it("over £100m is a warning (budgetOk false), never a block on adding", () => {
    const squad = Array.from({ length: 14 }, (_, i) =>
      makePlayer({ id: i + 1, position: (["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD"] as Position[])[i], teamId: i + 1, price: 8 }),
    );
    expect(validateSquad(squad).budgetOk).toBe(false);
    expect(canAddPlayer(squad, makePlayer({ id: 99, position: "FWD", teamId: 20, price: 14 })).ok).toBe(true);
  });
  it("max 3 per club and 2/5/5/3 composition are enforced", () => {
    const three = [1, 2, 3].map((id) => makePlayer({ id, position: "MID", teamId: 7 }));
    expect(canAddPlayer(three, makePlayer({ id: 4, position: "DEF", teamId: 7 })).ok).toBe(false);
    const gks = [1, 2].map((id) => makePlayer({ id, position: "GKP", teamId: id }));
    expect(canAddPlayer(gks, makePlayer({ id: 3, position: "GKP", teamId: 3 })).ok).toBe(false);
  });
});

describe("Import by FPL team ID", () => {
  const players = new Map(Array.from({ length: 15 }, (_, i) => [i + 1, makePlayer({ id: i + 1, position: "MID" })]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = { id: 123, name: "Mine", player_first_name: "A", player_last_name: "B" } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history = { current: [{ event: 7, bank: 5 }], chips: [] } as any;
  const picks = (benchMultiplier: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ active_chip: benchMultiplier ? "bboost" : null, picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1, position: i + 1, multiplier: i === 0 ? 2 : i < 11 ? 1 : benchMultiplier, is_captain: i === 0, is_vice_captain: i === 1 })) }) as any;

  it("a normal week imports 11 starters, captain, vice and bank in £m", () => {
    const { squad } = normalizeEntryImport(team, history, picks(0), 7, players);
    expect(squad.playerIds).toHaveLength(15);
    expect(squad.startingXI).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(squad.captainId).toBe(1);
    expect(squad.viceCaptainId).toBe(2);
    expect(squad.importedFrom?.bank).toBe(0.5);
  });

  it("[L4] a bank FPL doesn't send is unknown (null), not £0.0m", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { squad } = normalizeEntryImport(team, { current: [{ event: 7 }], chips: [] } as any, picks(0), 7, players);
    expect(squad.importedFrom?.bank).toBeNull();
    expect(normalizeEntryImport(team, history, picks(0), 7, players).squad.importedFrom?.bank).toBe(0.5);
  });

  it("[TB-4] a Bench Boost week (bench multiplier 1) still imports positions 1-11 as the starting XI", () => {
    const { squad } = normalizeEntryImport(team, history, picks(1), 7, players);
    expect(squad.startingXI).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
