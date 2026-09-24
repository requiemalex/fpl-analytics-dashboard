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
  showReferenceLine,
  dataView,
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
  format: (v: number | null) => string;
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
}) {
  const emptyMessage = `No eligible ${kind === "player" ? "players" : "teams"} have data for this chart with the current filters.`;

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        />
      ) : (
        <BarTopN data={barData} valueLabel={yLabel} format={format} onBarClick={onSelect} emptyMessage={emptyMessage} />
      )}
    </div>
  );
}
