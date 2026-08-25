import React from "react";

export interface TeamTopListRow {
  teamId: number;
  name: string;
  shortName: string;
  value: number | null;
}

export function TeamTopList({
  title,
  rows,
  format,
  onSelect,
  emptyMessage = "No data available.",
}: {
  title: string;
  rows: TeamTopListRow[];
  format: (v: number | null) => string;
  onSelect?: (teamId: number) => void;
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
        rows.map((row) => (
          <div className="stat-row" key={row.teamId} onClick={() => onSelect?.(row.teamId)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <span className="stat-row-name">{row.name}</span>
            <span className="stat-row-value">{format(row.value)}</span>
          </div>
        ))
      )}
    </div>
  );
}
