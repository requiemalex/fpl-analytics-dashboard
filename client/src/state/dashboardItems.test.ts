import { describe, expect, it } from "vitest";
import { normalizeDashboardGraph, type DashboardGraphConfig } from "./useDashboardGraphs";
import { normalizeSummaryTile, type SummaryTileConfig } from "./useSummaryTiles";
import { mapReadableEntries } from "./persistentStorage";

const graphs = (raw: unknown[]) => mapReadableEntries(raw, (g) => normalizeDashboardGraph(g as Partial<DashboardGraphConfig>));
const tiles = (raw: unknown[]) => mapReadableEntries(raw, (t) => normalizeSummaryTile(t as Partial<SummaryTileConfig>));

describe("saved Dashboard tiles and graphs a damaged store can't repair are skipped, not drawn (audit 2026-10-23 in-app)", () => {
  it("a graph without its statistics is skipped; the rest load", () => {
    const loaded = graphs([
      { id: "g1", scope: "player", name: "G", chartType: "scatter" },
      { id: "g2", scope: "player", chartType: "scatter", xMetricKey: "xG", yMetricKey: "goals" },
      { id: "g3", scope: "team", chartType: "bar", yMetricKey: "points" },
      { scope: "player", chartType: "bar", yMetricKey: "points" },
      { id: "g5", scope: "everyone", chartType: "bar", yMetricKey: "points" },
    ]);
    expect(loaded.map((g) => g.id)).toEqual(["g2", "g3"]);
    expect(loaded[1].xMetricKey).toBe(""); // a bar graph's unused X
  });

  it("a tile without a statistic, id or scope is skipped", () => {
    const loaded = tiles([{ id: "t1", scope: "player" }, { id: "t2", scope: "player", metricKey: "totalPoints" }, { scope: "team", metricKey: "points" }, { id: "t4", scope: "team", metricKey: "" }]);
    expect(loaded.map((t) => t.id)).toEqual(["t2"]);
  });
});
