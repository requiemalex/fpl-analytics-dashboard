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
}: {
  title: string;
  rows: TopListRow[];
  format: (v: number | null) => string;
  onSelect?: (id: number) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
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
