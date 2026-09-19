import React, { useMemo } from "react";
import { useFilteredPlayers } from "../state/useFilteredPlayers";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { columnByKey } from "./playerColumns";
import { ScatterWithReference, type ScatterPoint } from "./charts/ScatterWithReference";
import { BarTopN, type BarDatum } from "./charts/BarTopN";
import { LocalViewControls } from "./LocalViewControls";
import type { SavedUserGraph } from "../state/useSavedUserGraphs";
import type { NormalizedPlayer } from "../types/normalized";
import type { HistoricPlayerProfile } from "../metrics/historicAnalysis";

/**
 * One saved User Analysis graph, fully self-contained: its own resolved-
 * stats computation, its own filtering, its own chart data — all keyed off
 * this graph's own `view` (analysis mode + filters), never the page's or
 * any other graph's. Rendered as a sibling component instance (one per
 * saved graph) specifically so each graph's hooks — useFilteredPlayers
 * included — live in their own component and don't turn into a variable
 * number of hook calls in the parent as graphs are added/removed (up to 5,
 * changing at runtime) — see the "Rendered fewer hooks than expected"
 * class of bug this app has hit before (TeamBuilder.tsx has the fuller
 * writeup) for why that matters.
 */
export function UserAnalysisGraphCard({
  graph,
  players,
  historicProfiles,
  currentSeasonHasStarted,
  onUpdateView,
  onRemove,
  onSelectPlayer,
}: {
  graph: SavedUserGraph;
  players: NormalizedPlayer[];
  historicProfiles: Map<number, HistoricPlayerProfile>;
  currentSeasonHasStarted: boolean;
  onUpdateView: (id: string, view: SavedUserGraph["view"]) => void;
  onRemove: (id: string) => void;
  onSelectPlayer: (id: number) => void;
}) {
  const { resolved, noDataCount } = useMemo(
    () => resolvePlayerStatsList(players, graph.view.analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, graph.view.analysisMode, historicProfiles, currentSeasonHasStarted],
  );
  const filtered = useFilteredPlayers(resolved, graph.view.filters, graph.view.analysisMode);

  const xColumn = columnByKey(graph.xMetricKey);
  const yColumn = columnByKey(graph.yMetricKey);

  const scatterData: ScatterPoint[] = useMemo(() => {
    if (graph.chartType !== "scatter" || !xColumn || !yColumn) return [];
    const points: ScatterPoint[] = [];
    for (const p of filtered) {
      const derived = getPlayerDerivedMetrics(p);
      const x = xColumn.getValue(p, derived);
      const y = yColumn.getValue(p, derived);
      if (x === null || y === null) continue;
      points.push({ id: p.id, label: p.name, x, y });
    }
    return points;
  }, [filtered, graph.chartType, xColumn, yColumn]);

  const barData: BarDatum[] = useMemo(() => {
    if (graph.chartType !== "bar" || !yColumn) return [];
    const points: BarDatum[] = [];
    for (const p of filtered) {
      const derived = getPlayerDerivedMetrics(p);
      const v = yColumn.getValue(p, derived);
      if (v === null) continue;
      points.push({ id: p.id, label: p.name, value: v });
    }
    return points;
  }, [filtered, graph.chartType, yColumn]);

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {graph.name}
        </div>
        <button type="button" className="btn" onClick={() => onRemove(graph.id)} title="Remove this saved graph">
          Remove
        </button>
      </div>

      <LocalViewControls idPrefix={graph.id} state={graph.view} onChange={(next) => onUpdateView(graph.id, next)} />

      {graph.chartType === "scatter" && xColumn && yColumn && (
        <ScatterWithReference data={scatterData} xLabel={xColumn.label} yLabel={yColumn.label} onPointClick={onSelectPlayer} />
      )}
      {graph.chartType === "bar" && yColumn && (
        <BarTopN data={barData} valueLabel={yColumn.label} format={yColumn.format} onBarClick={onSelectPlayer} />
      )}

      {graph.view.analysisMode !== "live" && noDataCount > 0 && (
        <p className="page-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
          {noDataCount.toLocaleString("en-GB")} player(s) have no data for this mode — still shown above where they can be, with a gap for
          the metrics this mode can't fill in.
        </p>
      )}
    </div>
  );
}
