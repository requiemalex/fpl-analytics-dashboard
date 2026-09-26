import React from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes } from "../metrics/fixedMinutesFloor";
import { HISTORIC_WINDOW_SEASONS } from "../metrics/historicAnalysis";
import { fmtDecimal } from "../utils/format";

/** A stopwatch standing on a floor line: "a minutes floor is in force here". */
export function MinutesFloorIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="7.2" r="4.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.7v2.5l1.7 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 1.3h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M1.5 14.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Marks a section where the fixed minimum-minutes floor is applied
 * automatically because the user has no Min Minutes control of their own
 * (<fixed_minutes_floor>), so a player missing from a ranking, or shown
 * without a percentile or colour, isn't mistaken for missing data. The
 * hover text says what the floor does there.
 */
export function MinutesFloorBadge({ note }: { note: string }) {
  return (
    <span className="data-view-badge" title={note} aria-label={note}>
      <MinutesFloorIcon />
    </span>
  );
}

/**
 * Marks a player who is under the fixed floor (<fixed_minutes_floor>) — the
 * same stopwatch, in the warning colour. The hover text (smallSampleNote)
 * says why he has no percentiles or colours.
 */
export function SmallSampleBadge({ note }: { note: string }) {
  return (
    <span className="data-view-badge small-sample-badge" title={note} aria-label={note}>
      <MinutesFloorIcon />
    </span>
  );
}

/** Hover text for SmallSampleBadge. `minutes` null: Historic Average, where no window season reached the floor. */
export function smallSampleNote(minutes: number | null, mode: AnalysisMode): string {
  if (minutes === null) {
    return `Small sample — no season in the last ${HISTORIC_WINDOW_SEASONS} with ${FIXED_FLOOR_MINUTES}+ minutes, so nothing counts toward Historic Average: no figures, percentiles or colours.`;
  }
  return `Small sample — ${fmtDecimal(minutes, 0)} min in this mode, under the ${fixedFloorMinutes(mode)}-minute floor: no percentiles or colours.`;
}

const PREFIX = "Minimum minutes applied automatically";

/** Hover text for the player profile and Player Comparison: the floor turns percentiles and colours off below it. */
export function profileFloorNote(mode: AnalysisMode): string {
  if (mode === "historicAverage") {
    return `${PREFIX}: Historic Average counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes. A player with none is a small sample — no figures, percentile or colour.`;
  }
  const scope = mode === "live" ? " this season" : "";
  return `${PREFIX}: a player under ${fixedFloorMinutes(mode)} minutes${scope} is a small sample — no percentile or colour.`;
}

/**
 * Hover text for a Default Dashboard tile or graph, or null when no floor
 * applies to it. `playerFloor`: players under the floor are left out;
 * `historicSeasons`: Historic Average counts only seasons that reach the
 * floor.
 */
export function dashboardFloorNote(mode: AnalysisMode, { playerFloor, historicSeasons }: { playerFloor: boolean; historicSeasons: boolean }): string | null {
  const parts: string[] = [];
  if (playerFloor) parts.push(`only players with ${fixedFloorMinutes(mode)}+ minutes are included`);
  if (historicSeasons) parts.push(`Historic Average counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes`);
  if (parts.length === 0) return null;
  return `${PREFIX}: ${parts.join("; ")}.`;
}
