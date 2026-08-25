import { useState, type Dispatch, type SetStateAction } from "react";

/** Floor for both manual resize and Fit to Box — below this a column stops being readable. Bumped from 56 to give the filter icon (added alongside the resize handle) room to sit without crowding the label text. */
export const MIN_COLUMN_WIDTH = 64;

export interface UseColumnCustomization {
  visibleColumns: string[];
  setVisibleColumns: (keys: string[]) => void;
  columnWidths: Record<string, number>;
  dragOverKey: string | null;
  setDragOverKey: Dispatch<SetStateAction<string | null>>;
  resizingKey: string | null;
  toggleColumn: (key: string) => void;
  /** Order, visibility, AND size all return to the packaged defaults — widths go back to natural (no entry = auto width). */
  resetColumns: () => void;
  reorderColumn: (draggedKey: string, targetKey: string) => void;
  /**
   * Pointer-based, not HTML5 drag-and-drop — resizing needs continuous
   * position feedback while the same element is being interacted with,
   * which native drag-and-drop doesn't give you. Callers should set
   * `draggable={false}` on the resize handle itself so this gesture isn't
   * also interpreted as a column-reorder drag on the header it sits in.
   */
  startResize: (e: React.PointerEvent, key: string) => void;
  /** Compresses every currently-visible column to share `availableWidth`, floored at MIN_COLUMN_WIDTH. Callers compute availableWidth themselves (their own pinned columns' measured widths vary by table). */
  fitToBox: (availableWidth: number) => void;
}

/**
 * One instance manages one independent, reorderable/resizable column set.
 * Team Building's table uses two instances (predictive + historic/raw)
 * so the two groups can never be reordered into each other — dragging a
 * column from one instance's set onto a key that only exists in the
 * other's is a no-op by construction, since `reorderColumn` looks the
 * dragged key up in its own `visibleColumns` and finds nothing (`indexOf`
 * returns -1), not because of any explicit cross-group guard.
 */
export function useColumnCustomization(defaultVisibleColumns: string[]): UseColumnCustomization {
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(defaultVisibleColumns);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  function setVisibleColumns(keys: string[]) {
    setVisibleColumnsState(keys);
  }

  function toggleColumn(key: string) {
    // Newly-shown columns append to the end of the current custom order,
    // rather than snapping back to canonical order.
    setVisibleColumnsState((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function resetColumns() {
    setVisibleColumnsState(defaultVisibleColumns);
    setColumnWidths({});
  }

  function reorderColumn(draggedKey: string, targetKey: string) {
    setVisibleColumnsState((prev) => {
      const from = prev.indexOf(draggedKey);
      const to = prev.indexOf(targetKey);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggedKey);
      return next;
    });
  }

  function startResize(e: React.PointerEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startWidth = columnWidths[key] ?? th?.getBoundingClientRect().width ?? 100;
    const startX = e.clientX;
    setResizingKey(key);
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      setColumnWidths((prev) => ({ ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + delta)) }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setResizingKey(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function fitToBox(availableWidth: number) {
    if (visibleColumns.length === 0) return;
    const perColumn = Math.max(MIN_COLUMN_WIDTH, Math.floor(availableWidth / visibleColumns.length));
    const next: Record<string, number> = {};
    for (const key of visibleColumns) next[key] = perColumn;
    setColumnWidths(next);
  }

  return {
    visibleColumns,
    setVisibleColumns,
    columnWidths,
    dragOverKey,
    setDragOverKey,
    resizingKey,
    toggleColumn,
    resetColumns,
    reorderColumn,
    startResize,
    fitToBox,
  };
}
