import React from "react";
import { useAppState } from "../state/AppStateContext";
import { AnalysisModeIcon } from "./AnalysisModeIcon";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

/** Exported so anything else needing these exact labels (Dashboard's per-tile Data View select, DataViewBadge's tooltips) stays in sync with what this toggle itself shows, rather than re-typing the strings. */
export const ANALYSIS_MODE_OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];
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
export function AnalysisModeToggle({ mode, onChange }: { mode: AnalysisMode; onChange: (mode: AnalysisMode) => void }) {
  const { historicStatus, historicErrorMessage, historicSkippedPlayerIds, refreshHistoricData, historicRefreshing } = useAppState();

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
            Building the historic dataset — this can take up to a minute the first time, then it's cached.
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
      </div>
      {mode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a transient fetch issue) — everyone else
          is unaffected.
        </p>
      )}
    </div>
  );
}
