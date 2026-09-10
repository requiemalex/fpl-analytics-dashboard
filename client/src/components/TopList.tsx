import React from "react";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "./primitives";
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
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  rows: TopListRow[];
  format: (v: number | null) => string;
  onSelect?: (id: number) => void;
  emptyMessage?: string;
  /** Dashboard-only: renders a "Remove" button in the header when set — every other TopList usage omits this and is unaffected. */
  onRemove?: () => void;
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
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
        {onRemove && (
          <button type="button" className="btn" onClick={onRemove} title="Remove this tile">
            Remove
          </button>
        )}
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
            <span className="stat-row-value">{format(value)}</span>
          </div>
        ))
      )}
    </div>
  );
}
