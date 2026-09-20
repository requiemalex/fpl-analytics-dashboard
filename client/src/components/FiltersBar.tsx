import React from "react";
import { useAppState } from "../state/AppStateContext";
import type { GlobalScoutingFilters } from "../state/scoutingFilters";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

const MINUTES_STEP = 90;

/**
 * Fully controlled — no page-independent state of its own. Every page
 * that renders this owns its own `filters` (and passes its own
 * `analysisMode`, needed only to grey out Min Minutes in Current Season
 * mode) and reacts to `onChange`/`onReset` by updating its own local
 * state. This used to read a single global `filters` straight out of
 * `AppStateContext`, which meant changing Min Minutes on one page
 * silently changed what every other page showed too — the exact bug
 * this component's move to local-per-page state fixes. `idPrefix` keeps
 * form element ids unique when this renders more than once on the same
 * page (e.g. composed inside `LocalViewControls`, several of which can
 * be on screen at once on Underlying Numbers).
 */
export function FiltersBar({
  idPrefix = "f",
  filters,
  onChange,
  onReset,
  analysisMode,
}: {
  idPrefix?: string;
  filters: GlobalScoutingFilters;
  onChange: (next: GlobalScoutingFilters) => void;
  onReset: () => void;
  analysisMode: AnalysisMode;
}) {
  const { teams } = useAppState();

  function update<K extends keyof GlobalScoutingFilters>(key: K, value: GlobalScoutingFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="filters-bar">
      <div className="field">
        <label htmlFor={`${idPrefix}-search`}>Search</label>
        <input
          id={`${idPrefix}-search`}
          type="text"
          placeholder="Player name…"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-position`}>Position</label>
        <select
          id={`${idPrefix}-position`}
          value={filters.position}
          onChange={(e) => update("position", e.target.value as GlobalScoutingFilters["position"])}
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
          value={filters.teamId}
          onChange={(e) => update("teamId", e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
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

      <div className="field">
        <label htmlFor={`${idPrefix}-min-minutes`}>
          Min minutes {analysisMode === "live" && <span style={{ color: "var(--text-muted)" }}>(bypassed)</span>}
        </label>
        <input
          id={`${idPrefix}-min-minutes`}
          type="number"
          step={MINUTES_STEP}
          min={0}
          value={filters.minMinutes}
          disabled={analysisMode === "live"}
          title={analysisMode === "live" ? "Not applied in Current Season mode — everyone has low or zero minutes until real gameweeks accumulate" : undefined}
          onChange={(e) => update("minMinutes", Math.max(0, Math.round(Number(e.target.value) / MINUTES_STEP) * MINUTES_STEP))}
        />
      </div>

      <button className="btn" onClick={onReset} type="button">
        Reset Criteria
      </button>
    </div>
  );
}
