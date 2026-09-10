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
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
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
