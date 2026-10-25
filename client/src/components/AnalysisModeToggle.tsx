import React from "react";
import { useAppState } from "../state/AppStateContext";
import { AnalysisModeIcon } from "./AnalysisModeIcon";
import { MinutesFloorBadge } from "./MinutesFloorBadge";
import { clubSeasonsForMode } from "../metrics/teamStats";
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
 * The season(s) a Data View covers: "2026/27", or "2022/23–2025/26" for
 * Historic Average's window. The live season comes from the gameweek
 * deadlines, so Current Season is labelled before the historic dataset
 * loads; the other two need its reference season, so null until then.
 */
export function dataViewSeasonLabel(mode: AnalysisMode, referenceSeason: string | null, liveSeason: string | null): string | null {
  if (mode === "live" && liveSeason) return liveSeason;
  const seasons = clubSeasonsForMode(mode, referenceSeason);
  if (seasons.length === 0) return null;
  return seasons.length === 1 ? seasons[0] : `${seasons[seasons.length - 1]}–${seasons[0]}`;
}

/**
 * The one Data View picker every page and profile shows: the three mode
 * icons, the season(s) the selected view covers, and the amber stopwatch
 * when a minutes floor applies — all inside one box, so it reads as a
 * single control wherever it appears.
 */
export function DataViewPicker({
  mode,
  onChange,
  floorNote,
  floorActive = false,
}: {
  mode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  floorNote?: string;
  /** <marker_follows_data>: something the page shows is under the threshold, so the stopwatch is amber, not grey. */
  floorActive?: boolean;
}) {
  const { liveSeason, historicReferenceSeason } = useAppState();
  const season = dataViewSeasonLabel(mode, historicReferenceSeason, liveSeason ?? null);
  // Each mode's button names the seasons it would show: "Historic Average: 2022/23–2025/26".
  const modeTitle = (m: AnalysisMode, label: string) => {
    const seasons = dataViewSeasonLabel(m, historicReferenceSeason, liveSeason ?? null);
    return seasons ? `${label}: ${seasons}` : label;
  };

  return (
    <div className="card data-view-picker">
      <div className="data-view-picker-modes">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            className="btn btn-icon"
            aria-pressed={mode === o.mode}
            title={modeTitle(o.mode, o.label)}
            aria-label={o.label}
            style={mode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
            onClick={() => onChange(o.mode)}
          >
            <AnalysisModeIcon mode={o.mode} />
          </button>
        ))}
      </div>
      {season && (
        <span className="data-view-picker-season" title={`${OPTIONS.find((o) => o.mode === mode)!.label}: ${season}`}>
          {season}
        </span>
      )}
      {floorNote && <MinutesFloorBadge note={floorNote} active={floorActive} />}
    </div>
  );
}

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
  floorActive,
  clubFigures,
}: {
  mode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  /** Set on a section where the fixed minutes floor applies (<fixed_minutes_floor>) — shows its badge inside the picker, with this as its hover text. Without it there's no badge: Historic Average's 855-minute seasons alone don't mark a view, only the players under them (<minutes_marker>). */
  floorNote?: string;
  /** <marker_follows_data>: something the page shows is under its threshold (an entry carries the amber stopwatch) — amber, not grey. */
  floorActive?: boolean;
  /** Set on team views: Current Season club figures are summed from every player's matches, so a skipped player matters there too (audit 2026-10-18 M4). */
  clubFigures?: boolean;
}) {
  const { historicStatus, historicErrorMessage, historicSkippedPlayerIds, historicFetchSkippedPlayerIds, refreshHistoricData, historicRefreshing } = useAppState();

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <DataViewPicker mode={mode} onChange={onChange} floorNote={floorNote} floorActive={floorActive} />

        {mode !== "live" && historicStatus === "loading" && (
          <span className="page-subtitle" style={{ margin: 0 }}>
            Building the historic dataset. This can take up to a minute the first time, then it's cached.
          </span>
        )}
        {mode !== "live" && historicStatus === "error" && (
          <span className="page-subtitle" style={{ margin: 0, color: "var(--accent-negative)" }}>
            Couldn't load historic data: {historicErrorMessage}
            <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
              {historicRefreshing ? "Retrying…" : "Retry"}
            </button>
          </span>
        )}
      </div>
      {historicStatus === "ready" && historicFetchSkippedPlayerIds.length > 0 && clubFigures && mode === "live" && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          {historicFetchSkippedPlayerIds.length} player(s) couldn't be loaded this session (a transient fetch issue), so this season's club figures
          added up from players (FPL points, goals, assists, bonus, xG, xA, xGI, xGC, DC) show "—" for now. Results are unaffected.
        </p>
      )}
      {mode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a fetch failed, or FPL sent data the app couldn't read). Everyone else
          is unaffected.
        </p>
      )}
    </div>
  );
}
