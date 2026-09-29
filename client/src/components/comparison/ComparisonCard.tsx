import React from "react";
import { DataViewBadge } from "../DataViewBadge";
import { MinutesFloorBadge } from "../MinutesFloorBadge";
import { CardEditRemoveButtons } from "../IconToolbar";
import type { AnalysisMode } from "../../metrics/resolvePlayerStats";

export interface CardDragProps {
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * The frame every Player Comparison card shares — the Dashboard card
 * header exactly (title, then the minutes-floor and data-view badges and
 * Edit/Remove icons on the right), and the same drag-to-reorder outline.
 * `message` replaces the body (no players yet, loading, no data).
 */
export function ComparisonCard({
  title,
  noun,
  dataView,
  floorNote,
  message,
  onEdit,
  onRemove,
  children,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  noun: "chart" | "panel" | "graph";
  /** Omitted for a trend graph, which spans every completed season rather than one Data View. */
  dataView?: AnalysisMode | null;
  floorNote?: string | null;
  message?: string | null;
  onEdit?: () => void;
  onRemove?: () => void;
  children?: React.ReactNode;
} & CardDragProps) {
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
          {floorNote && <MinutesFloorBadge note={floorNote} />}
          {dataView && <DataViewBadge mode={dataView} />}
          <CardEditRemoveButtons
            noun={noun}
            onEdit={onEdit}
            onRemove={onRemove}
            editHint={noun === "graph" ? "change its name or what's on the y axis" : "change its name, statistics or data view"}
          />
        </div>
      </div>
      {message ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          {message}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
