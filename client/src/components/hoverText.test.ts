import { describe, it, expect } from "vitest";
import {
  averageFixtureHint,
  CLUB_STAT_HINTS,
  CLUB_UNDERSTAT_HINTS,
  clubRankHint,
  columnHint,
  fixtureHint,
  modelBreakdownHint,
  playerRankHint,
  PLAYER_STAT_HINTS,
  UNDERSTAT_STAT_HINTS,
} from "./hoverText";
import { PLAYER_COLUMNS } from "./playerColumns";
import { TEAM_COLUMNS } from "./teamColumns";
import { understatPlayerColumns, understatTeamColumns } from "../understat/columns";
import { computeExpectedPointsV2ForFixture, computeExpectedPointsV2ForWindow } from "../metrics/expectedPointsV2";
import { clubRanks } from "../metrics/comparativeColour";
import { makePlayer } from "../test/fixtures";
import type { UpcomingFixture } from "../metrics/fixtureTicker";

const fixture = (o: Partial<UpcomingFixture> = {}): UpcomingFixture => ({ fixtureId: 1, opponentTeamId: 2, opponentShortName: "BOU", isHome: true, difficulty: 2, ...o });

// <hover_text>: every hover is about this player, club or match, in one line.
describe("playerRankHint — a colour's rank in words", () => {
  it("says the top or bottom share of his position", () => {
    expect(playerRankHint(92.3, "MID")).toBe("Top 8% of midfielders");
    expect(playerRankHint(15, "FWD")).toBe("Bottom 15% of forwards");
    expect(playerRankHint(99.9, "GKP")).toBe("Top 1% of goalkeepers");
    expect(playerRankHint(0, "DEF")).toBe("Bottom 1% of defenders");
  });
  it("says 'around the middle' where the cell has no tint", () => {
    expect(playerRankHint(50, "MID")).toBe("Around the middle for midfielders");
  });
  it("leads with the statistic when given one", () => {
    expect(playerRankHint(92.3, "MID", "xG")).toBe("xG: top 8% of midfielders");
  });
  it("has nothing without a rank (under the floor, or never coloured)", () => {
    expect(playerRankHint(undefined, "MID")).toBeUndefined();
    expect(playerRankHint(null, "MID")).toBeUndefined();
  });
  it("hands every cell with the same rank the same string (cached)", () => {
    expect(playerRankHint(80.2, "DEF", "xGI")).toBe(playerRankHint(79.8, "DEF", "xGI"));
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
    expect(clubRankHint(flipped.get(1), flipped.size, "Goals Against")).toBe("Goals Against: 1st of 20 clubs");
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
  it("adds up his parts for the match and names what had no data", () => {
    const p = makePlayer({ id: 1, position: "FWD", minutes: 900, xG: 5, xA: null, defensiveContributions: 40 });
    const b = computeExpectedPointsV2ForFixture(p, fixture(), undefined, undefined, 0.9, undefined);
    const hint = modelBreakdownHint(b, fixture());
    expect(hint.startsWith(`Scoutline's model v BOU (H): ${b.total.toFixed(1)} pts = appearance`)).toBe(true);
    expect(hint).toContain("goals ");
    expect(hint).toContain("No data for assists, bonus, counted as 0");
    // The model's general limits stay in the README, not in every hover.
    expect(hint).not.toContain("Poisson");
  });
  it("doubles for the captain and says so", () => {
    const p = makePlayer({ id: 1, position: "MID", minutes: 900, xG: 3, xA: 2 });
    const b = computeExpectedPointsV2ForFixture(p, fixture(), undefined, undefined, 0.9, undefined);
    expect(modelBreakdownHint(b, fixture(), true)).toContain(`(captain ×2): ${(b.total * 2).toFixed(1)} pts`);
  });
  it("lists a gap once across a window of matches", () => {
    const p = makePlayer({ id: 1, position: "FWD", minutes: 900, xG: null, xA: 1 });
    const b = computeExpectedPointsV2ForWindow(p, [fixture(), fixture({ fixtureId: 2 }), fixture({ fixtureId: 3 })], 3, new Map(), 0.9, undefined)!;
    expect(b.gaps.filter((g) => g === "goals")).toHaveLength(1);
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
