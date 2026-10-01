import React from "react";
import { useAppState } from "../state/AppStateContext";
import { AnalysisModeIcon } from "./AnalysisModeIcon";
import { MinutesFloorBadge } from "./MinutesFloorBadge";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

/** Exported so anything else needing these exact labels (the dialogs' Data View pickers, DataViewBadge's tooltips) stays in sync with what this toggle itself shows, rather than re-typing the strings. `shortLabel` fits a Data View segment; `label` is its hover text. */
export const ANALYSIS_MODE_OPTIONS: { mode: AnalysisMode; label: string; shortLabel: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season", shortLabel: "Last Season" },
  { mode: "historicAverage", label: "Historic Average", shortLabel: "Historic Avg" },
  { mode: "live", label: "Current Season", shortLabel: "Current" },
];

/** The three Data Views as SegmentedControl options. */
export const DATA_VIEW_SEGMENTS = ANALYSIS_MODE_OPTIONS.map((o) => ({ value: o.mode, label: o.shortLabel, title: o.label }));
const OPTIONS = ANALYSIS_MODE_OPTIONS;

/**
 * Fully controlled — every page holds its own `analysisMode` in local
 * state and passes it in, rather than this reading one shared value out
 * of AppStateContext. Only the historic-dataset LOADING STATUS
 * (`historicStatus`/`historicErrorMessage`/etc.) still comes from
 * context, since that's genuinely shared, expensive-to-fetch data — the
 * bulk historic dataset is fetched once and reused by every page,
 * unlike which MODE a given page currently has selected.
 */
export function AnalysisModeToggle({
  mode,
  onChange,
  floorNote,
}: {
  mode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  /** Set on a section where the fixed minutes floor applies (<fixed_minutes_floor>) — shows its badge at the right of the toggle, with this as its hover text. */
  floorNote?: string;
}) {
  const { historicStatus, historicErrorMessage, historicSkippedPlayerIds, refreshHistoricData, historicRefreshing } = useAppState();

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              className="btn btn-icon"
              aria-pressed={mode === o.mode}
              title={o.label}
              aria-label={o.label}
              style={mode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
              onClick={() => onChange(o.mode)}
            >
              <AnalysisModeIcon mode={o.mode} />
            </button>
          ))}
        </div>

        {mode !== "live" && historicStatus === "loading" && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Building the historic dataset. This can take up to a minute the first time, then it's cached.
          </span>
        )}
        {mode !== "live" && historicStatus === "error" && (
          <span className="page-subtitle" style={{ margin: 0, color: "var(--accent-negative)" }}>
            Couldn't load historic data: {historicErrorMessage}
            <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
              {historicRefreshing ? "Retrying…" : "Retry"}
            </button>
          </span>
        )}
        {floorNote && (
          <span style={{ marginLeft: "auto" }}>
            <MinutesFloorBadge note={floorNote} />
          </span>
        )}
      </div>
      {mode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a transient fetch issue). Everyone else
          is unaffected.
        </p>
      )}
    </div>
  );
}
