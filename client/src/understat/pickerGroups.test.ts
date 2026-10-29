import { describe, expect, it } from "vitest";
import { PLAYER_COLUMNS } from "../components/playerColumns";
import { TEAM_COLUMNS } from "../components/teamColumns";
import { PLAYER_TILE_METRICS } from "../components/summaryTileMetrics";
import { COMPARISON_METRICS, isComparableColumn } from "../metrics/comparisonMetrics";
import { TREND_METRICS } from "../metrics/careerTrends";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import { understatTrends } from "./trends";

// Every picker's headings hold a good handful of figures (owner's call,
// 2026-10-29): no heading over one or two, with Understat on (its
// crossover group takes the figures both sources have out of FPL's) or
// off. A heading left with nothing isn't shown at all.

const MIN_PER_HEADING = 5;

const playerSet = understatPlayerColumns(() => null);
const teamSet = understatTeamColumns(new Map(), () => null);
const trendSet = understatTrends(null);

/** Each FPL heading's count, with the crossover figures taken out. */
function fplCounts(items: { key: string; group?: string }[], crossover: Set<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of items) if (!crossover.has(i.key)) counts[i.group ?? "Other"] = (counts[i.group ?? "Other"] ?? 0) + 1;
  return counts;
}

function expectFull(counts: Record<string, number>) {
  for (const [heading, n] of Object.entries(counts)) expect(n, heading).toBeGreaterThanOrEqual(MIN_PER_HEADING);
}

const off = new Set<string>();

describe("picker headings", () => {
  it("FPL's player headings, in the Explorer, Dashboard tile and axis pickers", () => {
    const on = new Set(Object.keys(playerSet.alternates));
    for (const crossover of [off, on]) {
      expectFull(fplCounts(PLAYER_COLUMNS, crossover));
      expectFull(fplCounts(PLAYER_TILE_METRICS, crossover));
    }
  });

  it("FPL's club headings", () => {
    for (const crossover of [off, new Set(Object.keys(teamSet.alternates))]) expectFull(fplCounts(TEAM_COLUMNS, crossover));
  });

  it("Player Comparison's radar, outputs and trend headings", () => {
    const comparableOn = new Set(Object.entries(playerSet.alternates).filter(([, c]) => isComparableColumn(c)).map(([k]) => k));
    for (const crossover of [off, comparableOn]) expectFull(fplCounts(COMPARISON_METRICS, crossover));
    for (const crossover of [off, new Set(Object.keys(trendSet.alternates))]) expectFull(fplCounts(TREND_METRICS, crossover));
  });

  it("Understat's own headings", () => {
    for (const g of playerSet.groups) {
      expect(g.columns.length, g.heading).toBeGreaterThanOrEqual(MIN_PER_HEADING);
      expect(g.columns.filter(isComparableColumn).length, `${g.heading} (Player Comparison)`).toBeGreaterThanOrEqual(MIN_PER_HEADING);
    }
    for (const g of [...teamSet.groups, ...trendSet.groups]) expect(g.columns.length, g.heading).toBeGreaterThanOrEqual(MIN_PER_HEADING);
  });
});
