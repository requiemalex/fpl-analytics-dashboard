import { useRef, useState, type Dispatch, type SetStateAction } from "react";

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
  /**
   * Shares `availableWidth` among the visible columns the user hasn't
   * resized by hand, floored at MIN_COLUMN_WIDTH (or the column's own
   * `minWidths` entry). A width set by dragging is kept, and its space is
   * taken out of the share. Callers compute availableWidth themselves
   * (their own pinned columns' measured widths vary by table). Safe to call
   * from a listener registered once: it reads the current columns, not the
   * ones from when the listener was made.
   */
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
export function useColumnCustomization(
  defaultVisibleColumns: string[],
  minWidths: Record<string, number> = {},
  /** Called when a drag-resize ends — pages re-fit here, so widening one column narrows the others (never below their minimum) rather than pushing the table past its box. */
  onResizeEnd?: () => void,
): UseColumnCustomization {
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(defaultVisibleColumns);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  // Refs, not state, for what fitToBox reads: pages call it from a window
  // resize listener registered once, which would otherwise see only the
  // first render's columns forever.
  const visibleColumnsRef = useRef(visibleColumns);
  visibleColumnsRef.current = visibleColumns;
  /** Columns whose width the user set by dragging — auto-fit leaves them alone until Reset. */
  const manualWidthKeysRef = useRef(new Set<string>());
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;
  /** A column's floor, for dragging and auto-fit alike: MIN_COLUMN_WIDTH, or its own `minWidths` entry if larger (Next 5 Fixtures keeps room for all five fixtures). */
  const minFor = (key: string) => Math.max(MIN_COLUMN_WIDTH, minWidths[key] ?? 0);

  function setVisibleColumns(keys: string[]) {
    setVisibleColumnsState(keys);
  }

  function toggleColumn(key: string) {
    // Newly-shown columns append to the end of the current custom order,
    // rather than snapping back to canonical order.
    if (visibleColumns.includes(key)) manualWidthKeysRef.current.delete(key);
    setVisibleColumnsState((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function resetColumns() {
    manualWidthKeysRef.current.clear();
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
      manualWidthKeysRef.current.add(key);
      setColumnWidths((prev) => ({ ...prev, [key]: Math.max(minFor(key), Math.round(startWidth + delta)) }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setResizingKey(null);
      onResizeEndRef.current?.();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function fitToBox(availableWidth: number) {
    const visible = visibleColumnsRef.current;
    const manual = manualWidthKeysRef.current;
    setColumnWidths((prev) => {
      const next: Record<string, number> = {};
      for (const key of manual) if (prev[key] !== undefined) next[key] = prev[key];
      let budget = availableWidth - visible.reduce((sum, key) => sum + (manual.has(key) ? (prev[key] ?? 0) : 0), 0);
      // A column that needs more than an equal share (Next 5 Fixtures) gets
      // its minimum first; the others then share what's left.
      let flexible = visible.filter((key) => !manual.has(key));
      let settled = false;
      while (!settled && flexible.length > 0) {
        const share = Math.floor(budget / flexible.length);
        const needMore = flexible.filter((key) => minFor(key) > share);
        settled = needMore.length === 0;
        for (const key of needMore) {
          next[key] = minFor(key);
          budget -= next[key];
        }
        flexible = flexible.filter((key) => next[key] === undefined);
      }
      const share = flexible.length > 0 ? Math.floor(budget / flexible.length) : 0;
      for (const key of flexible) next[key] = share;
      // Same widths as before → keep the same object, so React skips
      // re-rendering every table row (pages re-fit more than once per load).
      const prevKeys = Object.keys(prev);
      const unchanged = prevKeys.length === Object.keys(next).length && prevKeys.every((key) => prev[key] === next[key]);
      return unchanged ? prev : next;
    });
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
