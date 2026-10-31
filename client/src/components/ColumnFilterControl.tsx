import React from "react";
import { columnFilterProblem, type ColumnFilterSpec } from "../state/useColumnFilters";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { CHOICE, DUTIES, DutyIcon, dutyFilterValue, dutyName, type SetPieceDuty } from "./SetPieceDuties";

const ORDERS = [1, 2, 3] as const;

/**
 * <set_piece_filter>: a duty per row, its first, second and third choice
 * as the duty's own icon in gold, silver and bronze. Click a cell to pick
 * it, a row's name for the whole row; a player holding any picked cell
 * shows.
 */
function DutyGrid({ picked, onChange }: { picked: string[]; onChange: (duties: string[]) => void }) {
  const has = (v: string) => picked.includes(v);
  const toggle = (values: string[], on: boolean) => onChange(on ? [...new Set([...picked, ...values])] : picked.filter((v) => !values.includes(v)));
  const row = (d: SetPieceDuty) => ORDERS.map((o) => dutyFilterValue(d, o));
  return (
    <div className="duty-filter" role="group" aria-label="Set-piece duty">
      <span />
      {ORDERS.map((o) => (
        <span key={o} className="duty-filter-head">
          {o === 1 ? "1st" : o === 2 ? "2nd" : "3rd"}
        </span>
      ))}
      {DUTIES.map((d) => {
        const values = row(d);
        const whole = values.every(has);
        const rowLabel = `${dutyName(d)}: ${whole ? "clear" : "pick"} all three`;
        return (
          <React.Fragment key={d}>
            <button type="button" className="duty-filter-row" onClick={() => toggle(values, !whole)} title={rowLabel} aria-label={rowLabel}>
              {dutyName(d)}
            </button>
            {ORDERS.map((o) => {
              const v = dutyFilterValue(d, o);
              const label = `${dutyName(d)}: ${CHOICE[o - 1]} choice`;
              return (
                <button
                  key={o}
                  type="button"
                  className={`duty-filter-cell duty-icon duty-${o}${has(v) ? " on" : ""}`}
                  aria-pressed={has(v)}
                  aria-label={label}
                  title={label}
                  onClick={() => toggle([v], !has(v))}
                >
                  <DutyIcon duty={d} size={14} />
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function ColumnFilterControl({
  isOpen,
  isActive,
  filterDraft,
  onOpen,
  onCancel,
  onConfirm,
  onDraftChange,
  categoryOptions,
  dutyGrid,
  iconLabel: ownLabel,
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
  /** The set-piece duty grid (<set_piece_filter>) instead of numbers or a list: the Player header's. */
  dutyGrid?: boolean;
  /** The ▾'s hover, where "this column" isn't what it filters. */
  iconLabel?: string;
}) {
  const problem = columnFilterProblem(filterDraft);

  // Escape closes the open popover like Cancel, wherever focus is — unless
  // something opened after it (a player profile) is on top.
  useEscapeLayer(isOpen, onCancel);

  const iconLabel = ownLabel ?? (isActive ? "Filter active on this column. Click to edit" : "Filter this column");
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
          {dutyGrid ? (
            <DutyGrid picked={filterDraft.duties ?? []} onChange={(duties) => onDraftChange({ ...filterDraft, duties: duties.length > 0 ? duties : null })} />
          ) : categoryOptions ? (
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
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
