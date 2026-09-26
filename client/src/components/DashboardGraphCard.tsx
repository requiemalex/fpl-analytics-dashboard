import React from "react";
import { DataViewBadge } from "./DataViewBadge";
import { CardEditRemoveButtons } from "./IconToolbar";
import { ScatterWithReference, type ScatterPoint } from "./charts/ScatterWithReference";
import { BarTopN, type BarDatum } from "./charts/BarTopN";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { DashboardGraphType } from "../state/useDashboardGraphs";

/**
 * Presentational-only Dashboard graph card — mirrors TopList/TeamTopList's
 * header conventions (title, DataViewBadge, drag handle, Edit/Remove
 * icon buttons) exactly, but renders a chart instead of a ranked row list.
 * Unlike the old Underlying Numbers "User Analysis" graphs, a Dashboard
 * graph has no inline-editable filter bar of its own: its configuration is
 * set in the Add Graph dialog, and changed by reopening that same dialog
 * via Edit — same as a tile.
 */
export function DashboardGraphCard({
  title,
  kind,
  chartType,
  scatterData,
  barData,
  xLabel,
  yLabel,
  format,
  xFormat,
  ascending,
  showReferenceLine,
  dataView,
  emptyMessage: emptyMessageOverride,
  onSelect,
  onEdit,
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  /** Which entity this graph plots — only used to pick the right empty-state wording. */
  kind: "player" | "team";
  chartType: DashboardGraphType;
  scatterData: ScatterPoint[];
  barData: BarDatum[];
  xLabel: string;
  yLabel: string;
  /** The Y metric's formatter (bar axis and tooltip, scatter tooltip). */
  format: (v: number | null) => string;
  /** Scatter only — the X metric's formatter, for the tooltip. */
  xFormat?: (v: number | null) => string;
  /** Bar only — rank lowest first (the graph's Order). */
  ascending?: boolean;
  showReferenceLine: boolean;
  dataView: AnalysisMode;
  onSelect?: (id: number) => void;
  onEdit?: () => void;
  onRemove?: () => void;
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Replaces the default empty-state wording — e.g. while the historic data this graph needs is still loading, or failed. */
  emptyMessage?: string;
}) {
  const emptyMessage = emptyMessageOverride ?? `No eligible ${kind === "player" ? "players" : "teams"} have data for this chart with the current filters.`;

  return (
    <div
      className="card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={
        draggable
          ? { cursor: "grab", outline: isDragOver ? "2px dashed var(--accent-focus)" : undefined, outlineOffset: isDragOver ? -2 : undefined }
          : undefined
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <DataViewBadge mode={dataView} />
          <CardEditRemoveButtons noun="graph" onEdit={onEdit} onRemove={onRemove} />
        </div>
      </div>
      {chartType === "scatter" ? (
        <ScatterWithReference
          data={scatterData}
          xLabel={xLabel}
          yLabel={yLabel}
          showReferenceLine={showReferenceLine}
          onPointClick={onSelect}
          emptyMessage={emptyMessage}
          xFormat={xFormat}
          yFormat={format}
        />
      ) : (
        <BarTopN data={barData} valueLabel={yLabel} format={format} onBarClick={onSelect} emptyMessage={emptyMessage} ascending={ascending} />
      )}
    </div>
  );
}
