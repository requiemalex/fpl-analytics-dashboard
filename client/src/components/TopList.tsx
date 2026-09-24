import React from "react";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "./primitives";
import { DataViewBadge } from "./DataViewBadge";
import { CardEditRemoveButtons } from "./IconToolbar";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { NormalizedPlayer } from "../types/normalized";

export interface TopListRow {
  player: NormalizedPlayer;
  value: number | null;
}

/** Bar width as a % of this row's value relative to the largest |value| among the rows shown — the tile's own top row is always full-width, everything else scaled relative to it. */
function barWidthPercent(value: number | null, maxAbs: number): number {
  if (value === null || maxAbs <= 0) return 0;
  return Math.max(4, (Math.abs(value) / maxAbs) * 100);
}

export function TopList({
  title,
  rows,
  format,
  onSelect,
  emptyMessage = "No eligible players.",
  onEdit,
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dataView,
  signed,
}: {
  title: string;
  rows: TopListRow[];
  format: (v: number | null) => string;
  onSelect?: (id: number) => void;
  emptyMessage?: string;
  /** Dashboard-only: renders an Edit icon button in the header when set — every other TopList usage omits this and is unaffected. */
  onEdit?: () => void;
  /** Dashboard-only: renders a Remove icon button in the header when set — every other TopList usage omits this and is unaffected. */
  onRemove?: () => void;
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Dashboard-only: which analysis mode this tile was built from — shown as a small badge in the header. Omitted (no badge) for every other TopList usage, which has no per-tile mode of its own. */
  dataView?: AnalysisMode;
  /** True for a +/- comparison metric (Goals vs xG, etc.) — colours each row's bar green/red by its own sign instead of one accent colour for the whole tile. */
  signed?: boolean;
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
        rows.map(({ player, value }) => (
          <div className="stat-row" key={player.id} onClick={() => onSelect?.(player.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <span className="stat-row-name">
              <PositionBadge position={player.position} />
              <span className={availabilityTextClass(player.status)}>{player.name}</span>
              <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
              <span className="team">{player.teamShortName}</span>
            </span>
            <span className="stat-row-bar-track">
              <span
                className="stat-row-bar-fill"
                style={{
                  width: `${barWidthPercent(value, maxAbs)}%`,
                  background: signed ? (value !== null && value < 0 ? "var(--accent-negative)" : "var(--accent-positive)") : "var(--accent-focus)",
                }}
              />
            </span>
            <span className="stat-row-value">{format(value)}</span>
          </div>
        ))
      )}
    </div>
  );
}
