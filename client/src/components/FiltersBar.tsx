import React, { useState } from "react";
import { useAppState } from "../state/AppStateContext";
import type { GlobalScoutingFilters } from "../state/scoutingFilters";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { ResetIcon } from "./IconToolbar";

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
 * page (e.g. Dashboard's Add Tile and Add Graph modals, or composed
 * inside `LocalViewControls`).
 */
export function FiltersBar({
  idPrefix = "f",
  filters,
  onChange,
  onReset,
  analysisMode,
  showMinMinutes = true,
  showSearch = true,
  showPrice = false,
  minMinutesInLive = false,
}: {
  idPrefix?: string;
  filters: GlobalScoutingFilters;
  onChange: (next: GlobalScoutingFilters) => void;
  onReset: () => void;
  analysisMode: AnalysisMode;
  /** Off on Player Explorer only — its MINS column has its own per-column filter, making this redundant there. Everywhere else (Dashboard tiles/graphs, Player Comparison/Detail radars) has no equivalent, so Min Minutes stays the only way to set a minutes threshold. */
  showMinMinutes?: boolean;
  /** Off for the Dashboard Add Tile/Add Graph modals' "Filters" mode only — those modals have a separate "Player Search" mode (pick up to 5 specific players) covering the same job the free-text Search field used to, so showing both would be redundant/confusing. */
  showSearch?: boolean;
  /** On for the Dashboard Add Tile/Add Graph modals' "Filters" mode only — a live-price (£m) range, e.g. "only the best £5m players". Off everywhere else, matching showMinMinutes/showSearch's per-page opt-in pattern. */
  showPrice?: boolean;
  /** On for the Dashboard Add Tile/Add Graph modals only — Min Minutes stays editable (and is applied, see filterPlayers' `applyMinMinutesInLive`) in Current Season mode instead of being greyed out as bypassed. */
  minMinutesInLive?: boolean;
}) {
  const { teams } = useAppState();
  const minMinutesBypassed = analysisMode === "live" && !minMinutesInLive;
  // What's in the Min minutes box while it's being typed in — null when not
  // editing, so the box shows the real value. Every keystroke still applies
  // straight away; the draft only lets the box hold what was typed (blank,
  // or a number part-way through) instead of snapping it — it used to round
  // to the nearest 90 per keystroke, so typing "450" left it at 0.
  const [minMinutesDraft, setMinMinutesDraft] = useState<string | null>(null);

  function typeMinMinutes(raw: string) {
    setMinMinutesDraft(raw);
    const n = Math.floor(Number(raw));
    update("minMinutes", raw.trim() === "" || !Number.isFinite(n) ? 0 : Math.max(0, n));
  }

  /** A typed price, never below £0m; blank means no bound. */
  function parsePrice(raw: string): number | null {
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }

  function update<K extends keyof GlobalScoutingFilters>(key: K, value: GlobalScoutingFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="filters-bar">
      {showSearch && (
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
      )}

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

      {showPrice && (
        <div className="field">
          <label htmlFor={`${idPrefix}-min-price`}>Min price</label>
          <input
            id={`${idPrefix}-min-price`}
            type="number"
            step={0.1}
            min={0}
            placeholder="£4.0m"
            value={filters.minPrice ?? ""}
            onChange={(e) => update("minPrice", parsePrice(e.target.value))}
          />
        </div>
      )}

      {showPrice && (
        <div className="field">
          <label htmlFor={`${idPrefix}-max-price`}>Max price</label>
          <input
            id={`${idPrefix}-max-price`}
            type="number"
            step={0.1}
            min={0}
            placeholder="£15m"
            value={filters.maxPrice ?? ""}
            onChange={(e) => update("maxPrice", parsePrice(e.target.value))}
          />
        </div>
      )}

      {showMinMinutes && (
        <div className="field">
          <label htmlFor={`${idPrefix}-min-minutes`}>
            Min minutes {minMinutesBypassed && <span style={{ color: "var(--text-muted)" }}>(bypassed)</span>}
          </label>
          <input
            id={`${idPrefix}-min-minutes`}
            type="number"
            step={MINUTES_STEP}
            min={0}
            value={minMinutesDraft ?? String(filters.minMinutes)}
            disabled={minMinutesBypassed}
            title={minMinutesBypassed ? "Not applied in Current Season mode — everyone has low or zero minutes until real gameweeks accumulate" : undefined}
            onChange={(e) => typeMinMinutes(e.target.value)}
            onBlur={() => setMinMinutesDraft(null)}
          />
        </div>
      )}

      <button className="chip chip-icon" title="Reset Criteria" aria-label="Reset Criteria" onClick={onReset} type="button">
        <ResetIcon />
      </button>
    </div>
  );
}
