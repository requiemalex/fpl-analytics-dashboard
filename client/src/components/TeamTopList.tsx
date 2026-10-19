import React from "react";
import { noRowsMessage } from "./emptyMessages";
import { barWidths } from "./statBar";
import { TeamBadge } from "./primitives";
import { DataViewBadge } from "./DataViewBadge";
import { CardEditRemoveButtons } from "./IconToolbar";
import { percentileTint } from "../utils/colorScale";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

export interface TeamTopListRow {
  teamId: number;
  name: string;
  shortName: string;
  value: number | null;
  /** The club's rank among every club for this figure (<comparative_colouring>). */
  rank?: number;
}


export function TeamTopList({
  title,
  rows,
  format,
  onSelect,
  emptyMessage = noRowsMessage("team"),
  onEdit,
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
  /** Dashboard-only: renders an Edit icon button in the header when set — every other TeamTopList usage omits this and is unaffected. */
  onEdit?: () => void;
  /** Dashboard-only: renders a Remove icon button in the header when set — every other TeamTopList usage omits this and is unaffected. */
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
  const widths = barWidths(rows.map((r) => r.value));

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {dataView && <DataViewBadge mode={dataView} />}
          <CardEditRemoveButtons noun="tile" onEdit={onEdit} onRemove={onRemove} />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          {emptyMessage}
        </p>
      ) : (
        <div className="stat-list">
          {rows.map((row, i) => (
            <div className="stat-row" key={row.teamId} onClick={() => onSelect?.(row.teamId)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <span className="stat-row-name">
                <TeamBadge teamId={row.teamId} shortName={row.shortName} />
                {row.name}
              </span>
              <span className="stat-row-bar-track">
                <span className="stat-row-bar-fill" style={{ width: `${widths[i]}%`, background: "var(--accent-focus)" }} />
              </span>
              <span className="stat-row-value" style={{ background: percentileTint(row.rank) }}>
                {format(row.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
