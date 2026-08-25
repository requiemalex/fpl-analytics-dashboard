import React, { useState } from "react";
import { useAppState, type GlobalScoutingFilters } from "../state/AppStateContext";
import { ARCHETYPE_LABELS, type ArchetypeLabel } from "../metrics/archetypes";

const MINUTES_STEP = 90;

export function FiltersBar() {
  const { filters, setFilters, resetFilters, teams, analysisMode } = useAppState();
  const [showArchetypePopover, setShowArchetypePopover] = useState(false);

  function update<K extends keyof GlobalScoutingFilters>(key: K, value: GlobalScoutingFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleArchetype(label: ArchetypeLabel) {
    setFilters((f) => ({
      ...f,
      archetypes: f.archetypes.includes(label) ? f.archetypes.filter((a) => a !== label) : [...f.archetypes, label],
    }));
  }

  return (
    <div className="filters-bar">
      <div className="field">
        <label htmlFor="f-search">Search</label>
        <input id="f-search" type="text" placeholder="Player name…" value={filters.search} onChange={(e) => update("search", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="f-position">Position</label>
        <select id="f-position" value={filters.position} onChange={(e) => update("position", e.target.value as GlobalScoutingFilters["position"])}>
          <option value="ALL">All</option>
          <option value="GKP">Goalkeeper</option>
          <option value="DEF">Defender</option>
          <option value="MID">Midfielder</option>
          <option value="FWD">Forward</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-team">Team</label>
        <select
          id="f-team"
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

      <div className="field" style={{ position: "relative" }}>
        <label htmlFor="f-archetypes">Archetypes</label>
        <button
          id="f-archetypes"
          type="button"
          className="btn"
          onClick={() => setShowArchetypePopover((v) => !v)}
          style={{ minWidth: 90, textAlign: "left" }}
        >
          {filters.archetypes.length === 0 ? "All" : `${filters.archetypes.length} selected`}
        </button>
        {showArchetypePopover && (
          <div className="popover">
            {ARCHETYPE_LABELS.map((label) => (
              <label key={label}>
                <input type="checkbox" checked={filters.archetypes.includes(label)} onChange={() => toggleArchetype(label)} />
                {label}
              </label>
            ))}
            {filters.archetypes.length > 0 && (
              <button type="button" className="chip" style={{ marginTop: 6 }} onClick={() => update("archetypes", [])}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="f-min-minutes">Min minutes {analysisMode === "live" && <span style={{ color: "var(--text-muted)" }}>(bypassed)</span>}</label>
        <input
          id="f-min-minutes"
          type="number"
          step={MINUTES_STEP}
          min={0}
          value={filters.minMinutes}
          disabled={analysisMode === "live"}
          title={analysisMode === "live" ? "Not applied in Current Season mode — everyone has low or zero minutes until real gameweeks accumulate" : undefined}
          onChange={(e) => update("minMinutes", Math.max(0, Math.round(Number(e.target.value) / MINUTES_STEP) * MINUTES_STEP))}
        />
      </div>

      <button className="btn" onClick={resetFilters} type="button">
        Reset Criteria
      </button>
    </div>
  );
}
