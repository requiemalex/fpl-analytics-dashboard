import { describe, it, expect } from "vitest";
import { SCORING_RULES, splitMinutesProbability, computeExpectedPointsV2ForFixture } from "./expectedPointsV2";
import { computeExpectedPointsForSingleFixture, computeExpectedPointsForWindow } from "./expectedPoints";
import { getUpcomingFixtures, firstPickableEventId, type UpcomingFixture } from "./fixtureTicker";
import { computeBlendedMinutesReliability } from "./minutesReliabilityBlend";
import { buildHistoricPlayerProfile } from "./historicAnalysis";
import { canAddPlayer, validateSquad } from "./squadRules";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import { makePlayer, makeTeam, makeSeason } from "../test/fixtures";
import type { NormalizedFixture, Position } from "../types/normalized";

// FPL's own 2026/27 scoring, from the live bootstrap-static game_config.scoring (fetched 2026-10-18).
const FPL_SCORING = {
  long_play: 2,
  short_play: 1,
  assists: 3,
  saves: 1,
  goals_scored: { GKP: 10, DEF: 6, MID: 5, FWD: 4 },
  clean_sheets: { GKP: 4, DEF: 4, MID: 1, FWD: 0 },
  goals_conceded: { GKP: -1, DEF: -1, MID: 0, FWD: 0 },
  defensive_contribution: { GKP: 0, DEF: 2, MID: 2, FWD: 2 },
};
const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

const fixture = (o: Partial<UpcomingFixture> = {}): UpcomingFixture => ({ fixtureId: 1, opponentTeamId: 2, opponentShortName: "OPP", isHome: true, difficulty: 3, ...o });

describe("Expected Points Tier 2 — scoring rules match FPL 2026/27", () => {
  it.each(POSITIONS)("%s point values equal game_config.scoring", (pos) => {
    const r = SCORING_RULES[pos];
    expect(r.playing60plus).toBe(FPL_SCORING.long_play);
    expect(r.playing1to59).toBe(FPL_SCORING.short_play);
    expect(r.assist).toBe(FPL_SCORING.assists);
    expect(r.goal).toBe(FPL_SCORING.goals_scored[pos]);
    expect(r.cleanSheet).toBe(FPL_SCORING.clean_sheets[pos]);
    expect(r.everyTwoConceded).toBe(FPL_SCORING.goals_conceded[pos]);
    expect(r.defensiveContribution).toBe(FPL_SCORING.defensive_contribution[pos]);
    expect(r.everyThreeSaves).toBe(pos === "GKP" ? FPL_SCORING.saves : 0);
  });
});

describe("Expected Points Tier 2 — appearance split", () => {
  it.each([0, 0.1, 0.25, 0.5, 0.75, 0.9, 1])("probabilities for r=%s are non-negative and sum to 1", (r) => {
    const m = splitMinutesProbability(r);
    expect(m.p60Plus).toBeGreaterThanOrEqual(0);
    expect(m.p1to59).toBeGreaterThanOrEqual(0);
    expect(m.p0).toBeGreaterThanOrEqual(0);
    expect(m.p60Plus + m.p1to59 + m.p0).toBeCloseTo(1, 10);
    expect(m.p60Plus).toBeCloseTo(Math.pow(r, 1.5), 10);
    expect(m.p0).toBeCloseTo(Math.pow(1 - r, 1.5), 10);
  });
});

describe("Expected Points Tier 2 — hand-computed case (Gabriel, ARS, at NFO, GW7 2026/27 live data)", () => {
  // Raw inputs from bootstrap-static (2026-10-18) and history_past. Hand working is in the audit report.
  const player = makePlayer({ id: 4, position: "DEF", teamId: 1, minutes: 540, xG: 0.51, xA: 0.21, xGC: 4.65, defensiveContributions: 46, ownership: 21.1, status: "a", chanceOfPlayingNextRound: null });
  const ars = makeTeam({ id: 1, played: 6, strengthOverallHome: 4, strengthOverallAway: 5 });
  const nfo = makeTeam({ id: 18, played: 6, strengthOverallHome: 3, strengthOverallAway: 3 });
  const profile = buildHistoricPlayerProfile(
    [
      makeSeason({ seasonName: "2022/23", minutes: 3409, bonus: 15 }),
      makeSeason({ seasonName: "2023/24", minutes: 3042, bonus: 8 }),
      makeSeason({ seasonName: "2024/25", minutes: 2363, bonus: 9 }),
      makeSeason({ seasonName: "2025/26", minutes: 2750, bonus: 30 }),
    ],
    "2025/26",
  );

  // Phase 2 (M12, owner's decision): ownership left the blend, so the hand
  // figures below were recomputed without it, independently from the
  // formulas (the same working with ownership reproduces Phase 1's figures).
  it("reliability matches the hand blend (0.75 live + 0.25 historic, no ownership)", () => {
    expect(computeBlendedMinutesReliability(player, ars, profile).value).toBeCloseTo(0.93578, 4);
  });

  it("each scoring component and the total match the hand computation", () => {
    const r = computeBlendedMinutesReliability(player, ars, profile).value!;
    const b = computeExpectedPointsV2ForFixture(player, fixture({ opponentTeamId: 18, isHome: false, difficulty: 3 }), ars, nfo, r, profile);
    expect(b.appearance).toBeCloseTo(1.88895, 4);
    expect(b.goals).toBeCloseTo(0.47725, 4);
    expect(b.assists).toBeCloseTo(0.09826, 4);
    expect(b.cleanSheet).toBeCloseTo(1.44837, 4);
    expect(b.goalsConceded).toBeCloseTo(-0.36261, 4);
    expect(b.defensiveContribution).toBeCloseTo(0.37522, 4);
    expect(b.bonus).toBeCloseTo(0.45154, 4);
    expect(b.saves).toBe(0);
    expect(b.total).toBeCloseTo(4.37697, 4);
  });
});

describe("Expected Points Tier 2 — null-safety", () => {
  it("missing xG gives zero goals plus a caveat, never NaN", () => {
    const p = makePlayer({ id: 1, position: "FWD", minutes: 0, xG: null, xA: null });
    const b = computeExpectedPointsV2ForFixture(p, fixture(), undefined, undefined, 0.5, undefined);
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.goals).toBe(0);
    expect(b.caveats.some((c) => c.includes("xG/90"))).toBe(true);
  });
});

describe("Expected Points (FPL Official)", () => {
  const p = makePlayer({ id: 1, position: "FWD", epNext: 5 });
  it("the next fixture is ep_next unmodified; later ones scale by their own FDR", () => {
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 5 }), 0)).toBe(5);
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 2 }), 1)).toBeCloseTo(5.6, 10);
    expect(computeExpectedPointsForSingleFixture(p, fixture({ difficulty: 5 }), 2)).toBeCloseTo(3.8, 10);
  });
  it("null ep_next stays null, never 0", () => {
    expect(computeExpectedPointsForSingleFixture(makePlayer({ id: 2, position: "MID", epNext: null }), fixture(), 0)).toBeNull();
    expect(computeExpectedPointsForWindow(makePlayer({ id: 2, position: "MID", epNext: null }), [fixture()], 1)).toBeNull();
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
