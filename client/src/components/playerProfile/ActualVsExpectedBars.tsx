import React from "react";
import { fmtSigned } from "../../utils/format";

export interface ActualVsExpectedRow {
  label: string;
  /** actual − expected. Null renders the row muted with no bar. */
  value: number | null;
}

/**
 * A row's bar length is relative to the largest |value| among the rows
 * passed in — not a fixed scale — so a midfielder's typically-larger
 * goal-involvement deltas don't dwarf a defender's naturally smaller
 * ones into invisible slivers, and vice versa. Every row still reads
 * its own exact number from the badge, so the relative bar length is
 * just a glance-level cue, never the only source of truth.
 */
export function ActualVsExpectedBars({ rows }: { rows: ActualVsExpectedRow[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)));

  return (
    <div className="avx-bars">
      {rows.map((r) => {
        const pct = r.value === null ? 0 : Math.min(100, (Math.abs(r.value) / maxAbs) * 100);
        const positive = (r.value ?? 0) >= 0;
        return (
          <div className="avx-row" key={r.label}>
            <span className="avx-label">{r.label}</span>
            <span className="avx-track">
              <span
                className={`avx-fill ${r.value === null ? "" : positive ? "positive" : "negative"}`}
                style={{ width: `${r.value === null ? 0 : Math.max(pct, 3)}%` }}
              />
            </span>
            <span className={`avx-value num ${r.value === null ? "value-muted" : positive ? "value-positive" : "value-negative"}`}>
              {r.value === null ? "—" : fmtSigned(r.value, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
