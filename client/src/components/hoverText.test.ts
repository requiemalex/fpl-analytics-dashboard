import { describe, it, expect } from "vitest";
import {
  averageFixtureHint,
  CLUB_STAT_HINTS,
  CLUB_UNDERSTAT_HINTS,
  clubColumnHint,
  clubRankHint,
  columnHint,
  fixtureHint,
  modelBreakdownHint,
  noPercentileHint,
  percentileHint,
  playerColumnHint,
  playerRankHint,
  PLAYER_STAT_HINTS,
  statHover,
  UNDERSTAT_STAT_HINTS,
} from "./hoverText";
import { PLAYER_COLUMNS } from "./playerColumns";
import { TEAM_COLUMNS } from "./teamColumns";
import { understatPlayerColumns, understatTeamColumns } from "../understat/columns";
import { predictMatch, type FixtureOutlook, type PlayerEvidence } from "../metrics/pointsModel";
import { MODEL_PARAMS } from "../metrics/pointsModelParams.generated";
import { clubRanks } from "../metrics/comparativeColour";
import type { UpcomingFixture } from "../metrics/fixtureTicker";

const fixture = (o: Partial<UpcomingFixture> = {}): UpcomingFixture => ({ fixtureId: 1, eventId: 1, opponentTeamId: 2, opponentShortName: "BOU", isHome: true, difficulty: 2, ...o });

// <hover_text>: every hover is about this player, club or match, in one line.
describe("playerRankHint — a rank in words: his percentile within his position (<stat_hover>)", () => {
  it("names the percentile, then the top or bottom share of his position", () => {
    expect(playerRankHint(92.3, "MID")).toBe("92nd percentile of midfielders: top 8%");
    expect(playerRankHint(15, "FWD")).toBe("15th percentile of forwards: bottom 15%");
    expect(playerRankHint(99.9, "GKP")).toBe("99th percentile of goalkeepers: top 1%");
    expect(playerRankHint(0, "DEF")).toBe("1st percentile of defenders: bottom 1%");
  });
  it("says 'around the middle' where the cell has no tint", () => {
    expect(playerRankHint(50, "MID")).toBe("50th percentile of midfielders: around the middle");
  });
  it("gives a neutral figure's percentile with no top or bottom: it's neither better nor worse", () => {
    expect(playerRankHint(73, "FWD", { neutral: true })).toBe("73rd percentile of forwards");
  });
  it("names another pool when the rank isn't against his position's same figure", () => {
    expect(playerRankHint(81, "MID", { among: "midfielders' per-match averages" })).toBe("81st percentile of midfielders' per-match averages: top 19%");
    expect(percentileHint(12, "every club's upcoming fixtures")).toBe("12th percentile of every club's upcoming fixtures: bottom 12%");
  });
  it("has nothing without a rank (under the floor, nobody to compare with)", () => {
    expect(playerRankHint(undefined, "MID")).toBeUndefined();
    expect(playerRankHint(null, "MID")).toBeUndefined();
  });
  it("hands every cell with the same rank the same string (cached)", () => {
    expect(playerRankHint(80.2, "DEF")).toBe(playerRankHint(79.8, "DEF"));
  });
  it("says why there's none under the floor", () => {
    expect(noPercentileHint(855)).toBe("No percentile: under the 855-minute floor, a small sample");
  });
});

describe("statHover — every figure says what it is, then where it ranks (<stat_hover>)", () => {
  it("puts the statistic's meaning first and the rank on the line under it", () => {
    const definition = playerColumnHint({ key: "xG", label: "xG" });
    expect(statHover(definition, playerRankHint(92.3, "MID"))).toBe("xG: Expected goals: how many goals his chances would usually bring.\n92nd percentile of midfielders: top 8%");
  });
  it("keeps whichever half there is", () => {
    expect(statHover("xG: Expected goals.", undefined)).toBe("xG: Expected goals.");
    expect(statHover(undefined, "3rd of 20 clubs")).toBe("3rd of 20 clubs");
    expect(statHover(undefined, undefined)).toBeUndefined();
  });
  it("words a column's meaning the way its header does, FPL's or the second source's", () => {
    expect(playerColumnHint({ key: "price", label: "Price", higherIsBetter: false, varies: false })).toBe(
      "Price: FPL price today.\nLower is better. Today's figure, whatever the Data View.",
    );
    expect(playerColumnHint({ key: "xG", label: "xG" }, { sourceLabel: "Understat" })).toBe("Understat · xG: Expected goals: how many goals the chances would usually bring.");
    expect(clubColumnHint({ key: "goalsAgainst", label: "Goals Against", higherIsBetter: false })).toBe("Goals Against: Goals conceded.\nLower is better.");
    // A league position is its own rank: no "lower is better".
    expect(clubColumnHint({ key: "leaguePosition", label: "League Position", higherIsBetter: false })).toBe("League Position: Place in the league table.");
  });
});

describe("clubRankHint — a club's place among clubs", () => {
  const values = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, v: i + 1 }));
  const ranks = clubRanks(values, { id: (r) => r.id, value: (r) => r.v, higherIsBetter: true });
  it("turns the percentile back into a place, best first", () => {
    expect(clubRankHint(ranks.get(20), ranks.size)).toBe("1st of 20 clubs");
    expect(clubRankHint(ranks.get(18), ranks.size)).toBe("3rd of 20 clubs");
    expect(clubRankHint(ranks.get(9), ranks.size)).toBe("12th of 20 clubs");
    expect(clubRankHint(ranks.get(1), ranks.size)).toBe("20th of 20 clubs");
  });
  it("puts lower-is-better figures best first too", () => {
    const flipped = clubRanks(values, { id: (r) => r.id, value: (r) => r.v, higherIsBetter: false });
    expect(clubRankHint(flipped.get(1), flipped.size)).toBe("1st of 20 clubs");
  });
  it("gives a neutral figure's place by how high it is", () => {
    expect(clubRankHint(ranks.get(18), ranks.size, { neutral: true })).toBe("3rd highest of 20 clubs");
  });
  it("has nothing without a pool to compare with", () => {
    expect(clubRankHint(50, 1)).toBeUndefined();
  });
});

describe("fixtures", () => {
  it("names the opponent, venue and FPL difficulty", () => {
    expect(fixtureHint(fixture())).toBe("BOU at home · FPL difficulty 2/5");
    expect(fixtureHint(fixture({ isHome: false, difficulty: 5, opponentShortName: "MCI" }))).toBe("MCI away · FPL difficulty 5/5");
  });
  it("gives the average of the chips actually shown", () => {
    expect(averageFixtureHint(2.4, 5)).toBe("Average FPL difficulty of these 5 matches: 2.4 (1 easiest, 5 hardest)");
  });
});

describe("modelBreakdownHint — the model's figure in parts", () => {
  const outlook: FixtureOutlook = { goalsFor: 1.8, goalsAgainst: 1.0, baseFor: 1.4, baseAgainst: 1.3, win: 0.55, baseWin: 0.45 };
  const evidence = (o: Partial<PlayerEvidence> = {}): PlayerEvidence => ({
    position: "FWD",
    price: 8,
    current: { minutes: 900, starts: 10, goals: 6, assists: 2, xG: 5, xA: 1.5, dc: 30, saves: 0, bonus: 8, yellowCards: 2, penaltiesTaken: null, penaltyGoals: null },
    matches: Array.from({ length: 10 }, () => ({ started: true, minutes: 88 })),
    past: [],
    penaltyTaker: null,
    availability: 1,
    transfers: null,
    ...o,
  });
  it("adds up his parts for the match, then his chance of starting", () => {
    const b = predictMatch(evidence(), outlook, MODEL_PARAMS);
    const hint = modelBreakdownHint(b, fixture());
    expect(hint.startsWith(`Scoutline's model v BOU (H): ${b.total.toFixed(1)} pts = appearance`)).toBe(true);
    expect(hint).toContain("goals ");
    expect(hint).toContain(" − cards ");
    expect(hint).toContain(`${Math.round(b.startChance * 100)}% chance of starting`);
    // The model's workings stay in the README, not in every hover.
    expect(hint).not.toContain("Poisson");
  });
  it("says what a figure leans on: no minutes on record, availability", () => {
    const hint = modelBreakdownHint(predictMatch(evidence({ current: null, matches: [], availability: 0.75 }), outlook, MODEL_PARAMS), fixture());
    expect(hint).toContain("no Premier League minutes on record: his position and price stand in");
    expect(hint).toContain("75% chance of being available");
  });
  it("doubles for the captain and says so", () => {
    const b = predictMatch(evidence({ position: "MID" }), outlook, MODEL_PARAMS);
    expect(modelBreakdownHint(b, fixture(), true)).toContain(`(captain ×2): ${(b.total * 2).toFixed(1)} pts`);
  });
});

describe("columnHint — a header says what its statistic is", () => {
  it("leads with the statistic, then what's worth knowing", () => {
    expect(columnHint("Price", { hint: PLAYER_STAT_HINTS.price, lowerIsBetter: true, liveFigure: true })).toBe(
      "Price: FPL price today.\nLower is better. Today's figure, whatever the Data View.",
    );
    expect(columnHint("xGChain", { hint: UNDERSTAT_STAT_HINTS["us.xGChain"], source: "Understat" })).toBe(
      "Understat · xGChain: xG of every attack he touched, shot and assist included.",
    );
  });
  it("no longer carries the sort/drag/resize instructions (they're in the User Guide)", () => {
    expect(columnHint("Goals", { hint: PLAYER_STAT_HINTS.goals })).not.toMatch(/sort|drag|resize/i);
  });
});

describe("every column has a plain-words hint", () => {
  it("each FPL player column", () => {
    expect(PLAYER_COLUMNS.filter((c) => !PLAYER_STAT_HINTS[c.key]).map((c) => c.key)).toEqual([]);
  });
  it("each FPL club column", () => {
    expect(TEAM_COLUMNS.filter((c) => !CLUB_STAT_HINTS[c.key]).map((c) => c.key)).toEqual([]);
  });
  it("each Understat player column", () => {
    const set = understatPlayerColumns(() => null);
    const keys = [...Object.keys(set.alternates), ...set.groups.flatMap((g) => g.columns.map((c) => c.key))];
    expect(keys.filter((k) => !UNDERSTAT_STAT_HINTS[k])).toEqual([]);
  });
  it("each Understat club column", () => {
    const set = understatTeamColumns(new Map(), () => null);
    const keys = [...Object.keys(set.alternates), ...set.groups.flatMap((g) => g.columns.map((c) => c.key))];
    expect(keys.filter((k) => !(CLUB_UNDERSTAT_HINTS[k] ?? UNDERSTAT_STAT_HINTS[k]))).toEqual([]);
  });
});
