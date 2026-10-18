import React from "react";
import { barWidths } from "./statBar";
import { PositionBadge, TeamBadge, AvailabilityFlag, availabilityTextClass } from "./primitives";
import { DataViewBadge } from "./DataViewBadge";
import { MinutesFloorBadge } from "./MinutesFloorBadge";
import { CardEditRemoveButtons } from "./IconToolbar";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { NormalizedPlayer } from "../types/normalized";

export interface TopListRow {
  player: NormalizedPlayer;
  value: number | null;
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
  floorNote,
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
  /** Dashboard-only: hover text for the minutes-floor badge when the fixed floor applies to this tile (dashboardItemFloorNote); no badge when absent. */
  floorNote?: string | null;
}) {
  const widths = barWidths(rows.map((r) => r.value), signed);

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
          {floorNote && <MinutesFloorBadge note={floorNote} />}
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
          {rows.map(({ player, value }, i) => (
            <div className="stat-row" key={player.id} onClick={() => onSelect?.(player.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <span className="stat-row-name">
                <TeamBadge teamId={player.teamId} shortName={player.teamShortName} />
                <PositionBadge position={player.position} />
                <span className={availabilityTextClass(player.status)}>{player.name}</span>
                <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
              </span>
              <span className="stat-row-bar-track">
                <span
                  className="stat-row-bar-fill"
                  style={{
                    width: `${widths[i]}%`,
                    background: signed ? (value !== null && value < 0 ? "var(--accent-negative)" : "var(--accent-positive)") : "var(--accent-focus)",
                  }}
                />
              </span>
              <span className="stat-row-value">{format(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
