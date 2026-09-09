import React, { useState } from "react";
import { useAppState, type GlobalScoutingFilters } from "../state/AppStateContext";
import { ARCHETYPE_LABELS, type ArchetypeLabel } from "../metrics/archetypes";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

const MINUTES_STEP = 90;

const MODE_OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];

export const DEFAULT_LOCAL_FILTERS: GlobalScoutingFilters = {
  search: "",
  position: "ALL",
  teamId: "ALL",
  minMinutes: 0,
  archetypes: [],
};

/** One section/graph's own analysis-mode + filter selection — deliberately the same shape as the app-wide GlobalScoutingFilters/AnalysisMode pairing, just not threaded through AppStateContext, so it can be duplicated per section without one section's changes leaking into another's. */
export interface LocalViewState {
  analysisMode: AnalysisMode;
  filters: GlobalScoutingFilters;
}

export function createDefaultLocalViewState(): LocalViewState {
  return { analysisMode: "lastSeason", filters: { ...DEFAULT_LOCAL_FILTERS } };
}

/**
 * A self-contained, locally-scoped equivalent of AnalysisModeToggle +
 * FiltersBar combined — same controls, same options, but reading/writing
 * the `state`/`onChange` passed in rather than AppStateContext's single
 * shared filters/analysisMode. Used wherever a section (or a saved
 * User Analysis graph) needs its own independent "view" that other
 * sections' equivalent controls can't affect — AppStateContext's real
 * global toggle+filters bar (still used by Expected vs Actual here, and
 * by every other page) is untouched by this component's existence.
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
  const { teams, historicStatus, historicErrorMessage, historicSkippedPlayerIds, refreshHistoricData, historicRefreshing } = useAppState();
  const [showArchetypePopover, setShowArchetypePopover] = useState(false);

  function setMode(mode: AnalysisMode) {
    onChange({ ...state, analysisMode: mode });
  }

  function updateFilter<K extends keyof GlobalScoutingFilters>(key: K, value: GlobalScoutingFilters[K]) {
    onChange({ ...state, filters: { ...state.filters, [key]: value } });
  }

  function toggleArchetype(label: ArchetypeLabel) {
    const current = state.filters.archetypes;
    updateFilter("archetypes", current.includes(label) ? current.filter((a) => a !== label) : [...current, label]);
  }

  function resetCriteria() {
    onChange(createDefaultLocalViewState());
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              className="btn"
              aria-pressed={state.analysisMode === o.mode}
              style={state.analysisMode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
              onClick={() => setMode(o.mode)}
            >
              {o.label}
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

      <div className="filters-bar" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor={`${idPrefix}-search`}>Search</label>
          <input
            id={`${idPrefix}-search`}
            type="text"
            placeholder="Player name…"
            value={state.filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-position`}>Position</label>
          <select
            id={`${idPrefix}-position`}
            value={state.filters.position}
            onChange={(e) => updateFilter("position", e.target.value as GlobalScoutingFilters["position"])}
          >
            <option value="ALL">All</option>
            <option value="GKP">Goalkeeper</option>
            <option value="DEF">Defender</option>
            <option value="MID">Midfielder</option>
            <option value="FWD">Forward</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-team`}>Team</label>
          <select
            id={`${idPrefix}-team`}
            value={state.filters.teamId}
            onChange={(e) => updateFilter("teamId", e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          >
            <option value="ALL">All</option>
            {teams
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>

        <div className="field" style={{ position: "relative" }}>
          <label htmlFor={`${idPrefix}-archetypes`}>Archetypes</label>
          <button
            id={`${idPrefix}-archetypes`}
            type="button"
            className="btn"
            onClick={() => setShowArchetypePopover((v) => !v)}
            style={{ minWidth: 90, textAlign: "left" }}
          >
            {state.filters.archetypes.length === 0 ? "All" : `${state.filters.archetypes.length} selected`}
          </button>
          {showArchetypePopover && (
            <div className="popover">
              {ARCHETYPE_LABELS.map((label) => (
                <label key={label}>
                  <input type="checkbox" checked={state.filters.archetypes.includes(label)} onChange={() => toggleArchetype(label)} />
                  {label}
                </label>
              ))}
              {state.filters.archetypes.length > 0 && (
                <button type="button" className="chip" style={{ marginTop: 6 }} onClick={() => updateFilter("archetypes", [])}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-min-minutes`}>
            Min minutes {state.analysisMode === "live" && <span style={{ color: "var(--text-muted)" }}>(bypassed)</span>}
          </label>
          <input
            id={`${idPrefix}-min-minutes`}
            type="number"
            step={MINUTES_STEP}
            min={0}
            value={state.filters.minMinutes}
            disabled={state.analysisMode === "live"}
            title={
              state.analysisMode === "live"
                ? "Not applied in Current Season mode — everyone has low or zero minutes until real gameweeks accumulate"
                : undefined
            }
            onChange={(e) => updateFilter("minMinutes", Math.max(0, Math.round(Number(e.target.value) / MINUTES_STEP) * MINUTES_STEP))}
          />
        </div>

        <button className="btn" onClick={resetCriteria} type="button">
          Reset Criteria
        </button>
      </div>
    </div>
  );
}
