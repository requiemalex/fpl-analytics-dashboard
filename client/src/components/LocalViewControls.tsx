import React from "react";
import { useAppState } from "../state/AppStateContext";
import { FiltersBar } from "./FiltersBar";
import { AnalysisModeIcon } from "./AnalysisModeIcon";
import { createDefaultLocalViewState, type LocalViewState } from "../state/scoutingFilters";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

export { createDefaultLocalViewState, type LocalViewState } from "../state/scoutingFilters";

const MODE_OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];

/**
 * A self-contained, locally-scoped equivalent of AnalysisModeToggle +
 * FiltersBar combined into one card — reads/writes the `state`/`onChange`
 * passed in, never AppStateContext. Used wherever a section (or a saved
 * User Analysis graph) needs its own independent "view". Composes the
 * shared, controlled `FiltersBar` for the criteria row (both are
 * controlled components now, so there's exactly one implementation of
 * that markup); the mode-toggle buttons stay inline here rather than
 * nesting a second `<AnalysisModeToggle>` card, since this wants them
 * unwrapped inside its own single card alongside the filters row, not a
 * card-within-a-card.
 *
 * `idPrefix` keeps form element ids unique when multiple instances of
 * this component render on the same page at once (Value section, plus
 * up to 5 saved User Analysis graphs).
 */
export function LocalViewControls({
  idPrefix,
  state,
  onChange,
}: {
  idPrefix: string;
  state: LocalViewState;
  onChange: (next: LocalViewState) => void;
}) {
  const { historicStatus, historicErrorMessage, historicSkippedPlayerIds, refreshHistoricData, historicRefreshing } = useAppState();

  function setMode(mode: AnalysisMode) {
    onChange({ ...state, analysisMode: mode });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              className="btn btn-icon"
              aria-pressed={state.analysisMode === o.mode}
              title={o.label}
              aria-label={o.label}
              style={state.analysisMode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
              onClick={() => setMode(o.mode)}
            >
              <AnalysisModeIcon mode={o.mode} />
            </button>
          ))}
        </div>
        {state.analysisMode !== "live" && historicStatus === "loading" && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Building the historic dataset — this can take up to a minute the first time, then it's cached.
          </span>
        )}
        {state.analysisMode !== "live" && historicStatus === "error" && (
          <span className="page-subtitle" style={{ margin: 0, color: "var(--accent-negative)" }}>
            Couldn't load historic data: {historicErrorMessage}
            <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
              {historicRefreshing ? "Retrying…" : "Retry"}
            </button>
          </span>
        )}
      </div>
      {state.analysisMode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a transient fetch issue) — everyone else
          is unaffected.
        </p>
      )}

      <FiltersBar
        idPrefix={idPrefix}
        filters={state.filters}
        analysisMode={state.analysisMode}
        onChange={(filters) => onChange({ ...state, filters })}
        onReset={() => onChange(createDefaultLocalViewState())}
      />
    </div>
  );
}
