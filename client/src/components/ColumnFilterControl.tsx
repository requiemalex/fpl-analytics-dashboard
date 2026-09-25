import React, { useEffect } from "react";
import { columnFilterProblem, type ColumnFilterSpec } from "../state/useColumnFilters";

export function ColumnFilterControl({
  isOpen,
  isActive,
  filterDraft,
  onOpen,
  onCancel,
  onConfirm,
  onDraftChange,
  categoryOptions,
}: {
  isOpen: boolean;
  isActive: boolean;
  filterDraft: ColumnFilterSpec;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDraftChange: (spec: ColumnFilterSpec) => void;
  /** When set, this column is categorical (Team, Position) — renders a single "show only" dropdown instead of the three numeric threshold inputs below. */
  categoryOptions?: string[];
}) {
  const problem = columnFilterProblem(filterDraft);

  // Escape closes the open popover like Cancel, wherever focus is.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  const iconLabel = isActive ? "Filter active on this column — click to edit" : "Filter this column";
  return (
    <>
      <button
        type="button"
        className={`column-filter-icon${isActive ? " active" : ""}`}
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onCancel();
          else onOpen();
        }}
        title={iconLabel}
        aria-label={iconLabel}
      >
        ▾
      </button>
      {isOpen && (
        <div
          className="popover column-filter-popover"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Enter in a field applies the filter; on a focused button it just presses that button.
            if (e.key !== "Enter" || e.target instanceof HTMLButtonElement) return;
            e.preventDefault();
            if (!problem) onConfirm();
          }}
        >
          {categoryOptions ? (
            <div className="field">
              <label>Show only</label>
              <select
                value={filterDraft.category ?? "ALL"}
                onChange={(e) => onDraftChange({ ...filterDraft, category: e.target.value === "ALL" ? null : e.target.value })}
              >
                <option value="ALL">All</option>
                {categoryOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Less than or equal to</label>
                <input
                  type="number"
                  value={filterDraft.lte ?? ""}
                  onChange={(e) => onDraftChange({ ...filterDraft, lte: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Greater than or equal to</label>
                <input
                  type="number"
                  value={filterDraft.gte ?? ""}
                  onChange={(e) => onDraftChange({ ...filterDraft, gte: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Equal to</label>
                <input
                  type="number"
                  value={filterDraft.eq ?? ""}
                  onChange={(e) => onDraftChange({ ...filterDraft, eq: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn" onClick={onConfirm} disabled={!!problem} title={problem}>
              Enter
            </button>
            <button type="button" className="chip" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
