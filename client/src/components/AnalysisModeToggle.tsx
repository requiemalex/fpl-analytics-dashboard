import React from "react";
import { useAppState } from "../state/AppStateContext";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { HISTORIC_WINDOW_SEASONS, MIN_QUALIFYING_SEASON_MINUTES } from "../metrics/historicAnalysis";

const OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];

export function AnalysisModeToggle() {
  const {
    analysisMode,
    setAnalysisMode,
    historicStatus,
    historicReferenceSeason,
    historicErrorMessage,
    historicSkippedPlayerIds,
    refreshHistoricData,
    historicRefreshing,
  } = useAppState();

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              className="btn"
              aria-pressed={analysisMode === o.mode}
              style={analysisMode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
              onClick={() => setAnalysisMode(o.mode)}
            >
              {o.label}
            </button>
          ))}
        </div>

        {analysisMode === "live" && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Live 2026/27 season data. Price, ownership, and availability are always today's real figures; every other field is a genuine
            zero until gameweek 1 is played — not blank, an actual zero, since no games have happened yet this season.
          </span>
        )}
        {analysisMode !== "live" && historicStatus === "loading" && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Building the historic dataset — this can take up to a minute the first time, then it's cached.
          </span>
        )}
        {analysisMode === "historicAverage" && historicStatus === "ready" && historicReferenceSeason && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Averaged over qualifying seasons within the last {HISTORIC_WINDOW_SEASONS} completed seasons (≥{MIN_QUALIFYING_SEASON_MINUTES}{" "}
            mins played each).
          </span>
        )}
        {analysisMode !== "live" && historicStatus === "error" && (
          <span className="page-subtitle" style={{ margin: 0, color: "var(--accent-negative)" }}>
            Couldn't load historic data: {historicErrorMessage}
            <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
              {historicRefreshing ? "Retrying…" : "Retry"}
            </button>
          </span>
        )}
      </div>
      {analysisMode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a transient fetch issue) — everyone else
          is unaffected.
        </p>
      )}
      {analysisMode !== "live" && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          Ownership always shows today's live figure in every mode — the FPL API has no historic per-season ownership at all (confirmed
          directly against the raw data), so this is "who's popular right now", not "who was popular that season".
        </p>
      )}
    </div>
  );
}
