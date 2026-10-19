import React from "react";
import type { UseColumnCustomization } from "../state/useColumnCustomization";
import type { useColumnFilters } from "../state/useColumnFilters";
import { isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "./ColumnFilterControl";

type ColumnFiltersState = ReturnType<typeof useColumnFilters>;

/** The hover text every sortable, movable column header carries; `liveFigure` adds that it ignores the Data View. */
export function columnHeaderTitle(opts: { liveFigure?: boolean; sortable?: boolean; draggable?: boolean } = {}): string {
  const { liveFigure = false, sortable = true, draggable = true } = opts;
  return [
    liveFigure && "Always today's live figure, regardless of the toggle above",
    sortable && "Click to sort · Shift-click to add secondary sort",
    draggable && "Drag to reorder",
    "Drag the right edge to resize",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One column header of a customisable table (Player Explorer, Team
 * Explorer, Team Building's Add Players): click to sort (shift-click for a
 * tiebreaker), drag to reorder, drag the right edge to resize, and its ▾
 * filter. The table's own pieces go in as props: `badges` sit after the
 * label (the amber stopwatch), `trailing` after the sort arrow (the source
 * toggle and stale marker).
 */
export function ColumnHeader({
  columnKey,
  label,
  className,
  title,
  layout,
  width,
  narrowUnlessSet = false,
  draggable = true,
  sortDirection,
  onSort,
  filters,
  categoryOptions,
  badges,
  trailing,
  style,
}: {
  columnKey: string;
  label: React.ReactNode;
  className?: string;
  title: string;
  /** The table's column customisation (useColumnCustomization). */
  layout: Pick<UseColumnCustomization, "dragOverKey" | "setDragOverKey" | "reorderColumn" | "resizingKey" | "startResize">;
  /** The hand-set width, if any. */
  width: number | undefined;
  /** Unless hand-set, 1px: "as narrow as its content" (the Explorers' fixed identity columns). */
  narrowUnlessSet?: boolean;
  draggable?: boolean;
  sortDirection: "asc" | "desc" | undefined;
  /** Omitted: the column can't be sorted. */
  onSort?: (shiftKey: boolean) => void;
  /** Omitted: the column has no filter. */
  filters?: ColumnFiltersState;
  categoryOptions?: string[];
  badges?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const { dragOverKey, setDragOverKey, reorderColumn, resizingKey, startResize } = layout;
  const dragOver = draggable && dragOverKey === columnKey;
  return (
    <th
      className={className}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => e.dataTransfer.setData("text/plain", columnKey) : undefined}
      onDragOver={
        draggable
          ? (e) => {
              e.preventDefault();
              if (dragOverKey !== columnKey) setDragOverKey(columnKey);
            }
          : undefined
      }
      onDragLeave={draggable ? () => setDragOverKey((k) => (k === columnKey ? null : k)) : undefined}
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              setDragOverKey(null);
              const draggedKey = e.dataTransfer.getData("text/plain");
              if (draggedKey && draggedKey !== columnKey) reorderColumn(draggedKey, columnKey);
            }
          : undefined
      }
      onClick={onSort ? (e) => onSort(e.shiftKey) : undefined}
      title={title}
      style={{
        position: "relative",
        width: width ? `${width}px` : narrowUnlessSet ? 1 : undefined,
        maxWidth: width ? `${width}px` : undefined,
        cursor: draggable ? "grab" : undefined,
        outline: dragOver ? "2px dashed var(--accent-focus)" : undefined,
        outlineOffset: dragOver ? -2 : undefined,
        ...style,
      }}
    >
      {label}
      {badges}
      {sortDirection && <span className="sort-indicator">{sortDirection === "asc" ? "↑" : "↓"}</span>}
      {trailing}
      {filters && (
        <ColumnFilterControl
          isOpen={filters.openFilterKey === columnKey}
          isActive={isColumnFilterActive(filters.columnFilters[columnKey])}
          filterDraft={filters.filterDraft}
          onOpen={() => filters.openFilter(columnKey)}
          onCancel={filters.cancelFilter}
          onConfirm={filters.confirmFilter}
          onDraftChange={filters.setFilterDraft}
          categoryOptions={categoryOptions}
        />
      )}
      <span
        className={`column-resize-handle${resizingKey === columnKey ? " resizing" : ""}`}
        draggable={false}
        onPointerDown={(e) => startResize(e, columnKey)}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}
