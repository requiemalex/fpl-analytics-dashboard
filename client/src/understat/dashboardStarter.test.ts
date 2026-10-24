import { describe, expect, it } from "vitest";
import { externalColumnByKey, parseExternalMetricKey } from "../extensions/externalStats";
import { DEFAULT_SUMMARY_TILES } from "../state/useSummaryTiles";
import { DEFAULT_DASHBOARD_GRAPHS } from "../state/useDashboardGraphs";
import { dashboardItemFloorNote } from "../pages/Dashboard";
import { columnByKey } from "../components/playerColumns";
import { teamColumnByKey } from "../components/teamColumns";
import { understatPlayerColumns, understatTeamColumns, UNDERSTAT_SOURCE_ID } from "./columns";
import { UNDERSTAT_DASHBOARD_STARTER } from "./dashboardStarter";

// <source_starter_items>: Understat's own Starter tiles and graphs.

const playerSet = understatPlayerColumns(() => null);
const teamSet = understatTeamColumns(new Map(), () => null);
const { tiles, graphs } = UNDERSTAT_DASHBOARD_STARTER;

/** One of Understat's own figures, by its key. */
const ownColumn = (scope: "player" | "team", key: string) => (scope === "player" ? externalColumnByKey(playerSet, key) : externalColumnByKey(teamSet, key));

/** Every key an item names is a real figure: one of Understat's own, or an FPL column. */
function exists(scope: "player" | "team", key: string): boolean {
  const parsed = parseExternalMetricKey(key);
  if (!parsed) return scope === "player" ? !!columnByKey(key) : !!teamColumnByKey(key);
  return parsed.sourceId === UNDERSTAT_SOURCE_ID && !!ownColumn(scope, parsed.key);
}

describe("Understat's Starter items", () => {
  it("name figures that exist, and at least one of Understat's own on each", () => {
    for (const t of tiles) {
      expect(exists(t.scope, t.metricKey), t.id).toBe(true);
      expect(parseExternalMetricKey(t.metricKey), t.id).not.toBeNull();
    }
    for (const g of graphs) {
      expect(exists(g.scope, g.xMetricKey), g.id).toBe(true);
      expect(exists(g.scope, g.yMetricKey), g.id).toBe(true);
      expect([g.xMetricKey, g.yMetricKey].some((k) => parseExternalMetricKey(k) !== null), g.id).toBe(true);
    }
  });

  it("have ids of their own, never an FPL default's", () => {
    const ids = [...tiles, ...graphs].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fplIds = new Set([...DEFAULT_SUMMARY_TILES, ...DEFAULT_DASHBOARD_GRAPHS].map((i) => i.id));
    expect(ids.filter((id) => fplIds.has(id))).toEqual([]);
  });

  it("follow the packaged ones' rules: Last Season, no criteria of their own, the fixed floor on every player item", () => {
    for (const i of [...tiles, ...graphs]) {
      expect(i.dataView, i.id).toBe("lastSeason");
      expect(i.playerIds, i.id).toBeNull();
      expect(i.teamIds, i.id).toBeNull();
      if (i.scope === "player") expect(dashboardItemFloorNote(i, { defaultViewShown: true }), i.id).not.toBeNull();
      else expect(i.criteria, i.id).toBeNull();
    }
  });

  it("each tile lists in its figure's natural order, except the one asking whose finishing fell short", () => {
    for (const t of tiles) {
      const key = parseExternalMetricKey(t.metricKey)!.key;
      const column = ownColumn(t.scope, key)!;
      const natural = column.higherIsBetter === false ? "asc" : "desc";
      expect(t.direction, t.id).toBe(key === "us.npGoalsMinusNpxG" ? "asc" : natural);
    }
  });
});
