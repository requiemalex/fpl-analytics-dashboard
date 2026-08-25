import React from "react";
import type { ColumnFilterSpec } from "../state/useColumnFilters";

export function ColumnFilterControl({
  isOpen,
  isActive,
  filterDraft,
  onOpen,
  onCancel,
  onConfirm,
  onDraftChange,
}: {
  isOpen: boolean;
  isActive: boolean;
  filterDraft: ColumnFilterSpec;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDraftChange: (spec: ColumnFilterSpec) => void;
}) {
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
        title={isActive ? "Filter active on this column — click to edit" : "Filter this column"}
      >
        ▾
      </button>
      {isOpen && (
        <div
          className="popover column-filter-popover"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
        >
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
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn" onClick={onConfirm}>
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
