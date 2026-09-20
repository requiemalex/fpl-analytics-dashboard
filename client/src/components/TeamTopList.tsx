import React from "react";
import { TeamBadge } from "./primitives";
import { DataViewBadge } from "./DataViewBadge";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

export interface TeamTopListRow {
  teamId: number;
  name: string;
  shortName: string;
  value: number | null;
}

/** Same scaling as TopList's bar — see its comment. */
function barWidthPercent(value: number | null, maxAbs: number): number {
  if (value === null || maxAbs <= 0) return 0;
  return Math.max(4, (Math.abs(value) / maxAbs) * 100);
}

export function TeamTopList({
  title,
  rows,
  format,
  onSelect,
  emptyMessage = "No data available.",
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dataView,
}: {
  title: string;
  rows: TeamTopListRow[];
  format: (v: number | null) => string;
  onSelect?: (teamId: number) => void;
  emptyMessage?: string;
  /** Dashboard-only: renders a "Remove" button in the header when set — every other TeamTopList usage omits this and is unaffected. */
  onRemove?: () => void;
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Dashboard-only: which analysis mode this tile was built from — shown as a small badge in the header. */
  dataView?: AnalysisMode;
}) {
  const maxAbs = Math.max(0, ...rows.map((r) => Math.abs(r.value ?? 0)));

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="card-title">{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dataView && <DataViewBadge mode={dataView} />}
          {onRemove && (
            <button type="button" className="btn" onClick={onRemove} title="Remove this tile">
              Remove
            </button>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          {emptyMessage}
        </p>
      ) : (
        rows.map((row) => (
          <div className="stat-row" key={row.teamId} onClick={() => onSelect?.(row.teamId)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <span className="stat-row-name">
              <TeamBadge teamId={row.teamId} shortName={row.shortName} />
              {row.name}
            </span>
            <span className="stat-row-bar-track">
              <span className="stat-row-bar-fill" style={{ width: `${barWidthPercent(row.value, maxAbs)}%`, background: "var(--accent-focus)" }} />
            </span>
            <span className="stat-row-value">{format(row.value)}</span>
          </div>
        ))
      )}
    </div>
  );
}
