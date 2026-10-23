import React from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes, isUnderMinimum } from "../metrics/fixedMinutesFloor";
import { HISTORIC_WINDOW_SEASONS } from "../metrics/historicAnalysis";
import { fmtDecimal } from "../utils/format";

/** A stopwatch standing on a floor line: "a minutes threshold is in force here". */
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
 * An entry under a minutes threshold drawn on a chart (<minutes_marker>):
 * the amber stopwatch in place of a dot, centred on (cx, cy). Player
 * Comparison's trend points and the Dashboard's scatter points share it.
 */
export function SmallSampleMark({ cx, cy, size = 14 }: { cx: number; cy: number; size?: number }) {
  return (
    <g className="small-sample-mark" transform={`translate(${cx - size / 2},${cy - size / 2})`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2} />
      <MinutesFloorIcon size={size} />
    </g>
  );
}

/** The stopwatch struck through: "leave out what's under the minutes threshold" (HideSmallSamplesButton). */
export function HideSmallSamplesIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="7.2" r="4.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.7v2.5l1.7 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 1.3h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M1.5 14.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.2 1.8l11.6 11.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * <minutes_marker>: the one sign of a minimum-minutes threshold, anywhere
 * in the app (the owner's rule, 2026-10-19) — the stopwatch, and no other
 * symbol. Two uses:
 * - on an ENTRY (a row, season or point) that falls under one: always
 *   amber, its hover text saying by how much and what that does;
 * - on a VIEW (a Data View picker, tile, graph, card, column header or
 *   control) where a threshold is in force (MinutesFloorBadge): amber when
 *   something it shows is under the threshold, grey when nothing is
 *   (<marker_follows_data>, the owner's rule, 2026-10-20).
 */
export function SmallSampleBadge({ note }: { note: string }) {
  return (
    <span className="data-view-badge minutes-floor-badge small-sample-badge" title={note} aria-label={note}>
      <MinutesFloorIcon />
    </span>
  );
}

/**
 * The marker on a view where a threshold is in force (<minutes_marker>).
 * <marker_follows_data>: `active` — something the view shows right now is
 * under its threshold (marked with an entry stopwatch: on a graph, the
 * point or bar's own) — makes it amber; otherwise it's grey: the
 * threshold is still in force, nothing shown falls under it.
 */
export function MinutesFloorBadge({ note, active }: { note: string; active: boolean }) {
  if (active) return <SmallSampleBadge note={note} />;
  const idle = `${note} Nothing shown here is under it.`;
  return (
    <span className="data-view-badge minutes-floor-badge" title={idle} aria-label={idle}>
      <MinutesFloorIcon />
    </span>
  );
}

/**
 * Whether an entry is a small sample for the mode: under the fixed floor
 * (90 minutes Current Season, 450 otherwise), no minutes counting as 0
 * (<no_data_is_zero>). The one test behind every entry stopwatch, every
 * view stopwatch's amber, and every Hide button.
 */
export function isSmallSample(minutes: number | null, mode: AnalysisMode): boolean {
  return isUnderMinimum(minutes, fixedFloorMinutes(mode));
}

/** A view stopwatch's hover text, saying how many of the players it shows are under the fixed floor when any are (<marker_follows_data>). */
export function smallSamplesShownNote(note: string, count: number, mode: AnalysisMode): string {
  if (count === 0) return note;
  return `${note} ${count} player${count === 1 ? "" : "s"} shown here ${count === 1 ? "is" : "are"} under the ${fixedFloorMinutes(mode)}-minute floor.`;
}

/**
 * <hide_small_samples>: the switch that leaves out the entries under the
 * minutes threshold — the ones the amber stopwatch marks — wherever a
 * section lists players the user chose by criteria (Player Explorer, Team
 * Building's Add Players, a Dashboard tile or graph the user built). Shown
 * only when there's something to leave out, or while it's on (so it can be
 * turned off again). Off by default.
 */
export function HideSmallSamplesButton({ hidden, count, mode, onToggle }: { hidden: boolean; count: number; mode: AnalysisMode; onToggle: () => void }) {
  if (!hidden && count === 0) return null;
  const floor = fixedFloorMinutes(mode);
  const label = hidden
    ? `Show the players under the ${floor}-minute floor again (they're hidden now)`
    : `Hide the ${count} player${count === 1 ? "" : "s"} under the ${floor}-minute floor (marked with the amber stopwatch)`;
  return (
    <button type="button" className={`chip chip-icon hide-small-samples${hidden ? " active" : ""}`} title={label} aria-label={label} aria-pressed={hidden} onClick={onToggle}>
      <HideSmallSamplesIcon />
    </button>
  );
}

/**
 * Hover text for an entry under the fixed floor. A player with no minutes
 * for the mode counts as 0 (<no_data_is_zero>); in Historic Average that
 * means no window season reached 450, so nothing counts.
 */
export function smallSampleNote(minutes: number | null, mode: AnalysisMode): string {
  if (mode === "historicAverage" && minutes === null) {
    return `Small sample. No season in the last ${HISTORIC_WINDOW_SEASONS} with ${FIXED_FLOOR_MINUTES}+ minutes, so nothing counts toward Historic Average: no figures, percentiles or colours.`;
  }
  const played = minutes === null ? "No minutes in this mode (counts as 0)" : `Small sample: ${fmtDecimal(minutes, 0)} min in this mode`;
  return `${played}, under the ${fixedFloorMinutes(mode)}-minute floor: its figures for this Data View have no percentiles or colours.`;
}

/**
 * The marker for a row in a table or list (<minutes_marker>): a player
 * under the fixed floor for the mode has no colour anywhere
 * (<comparative_colouring>), so his row says why. No minutes for the mode
 * counts as 0, so it's under too (<no_data_is_zero>).
 */
export function RowSmallSampleBadge({ minutes, mode }: { minutes: number | null; mode: AnalysisMode }) {
  if (!isSmallSample(minutes, mode)) return null;
  return <SmallSampleBadge note={smallSampleNote(minutes, mode)} />;
}

const PREFIX = "Minimum minutes applied automatically";

/** Hover text for a view in Historic Average: the one Historic Average rule, everywhere. */
export function historicSeasonsNote(): string {
  return `${PREFIX}: Historic Average counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes. A player with none has no figures.`;
}

/** Hover text for the player profile and Player Comparison: the floor turns percentiles and colours off below it. */
export function profileFloorNote(mode: AnalysisMode): string {
  if (mode === "historicAverage") {
    return `${PREFIX}: Historic Average counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes. A player with none is a small sample, with no figures, percentile or colour.`;
  }
  const scope = mode === "live" ? " this season" : "";
  return `${PREFIX}: a player under ${fixedFloorMinutes(mode)} minutes${scope} is a small sample, with no percentile or colour.`;
}

/** Hover text for a Starter-view Player Comparison trend graph: a season under the floor is marked (careerTrends.ts `buildSeasonTrend`). */
export function trendFloorNote(): string {
  return `${PREFIX}: a season under ${FIXED_FLOOR_MINUTES} minutes is a small sample, marked with the amber stopwatch.`;
}

/** Hover text for a view with a minimum the user set (a Dashboard tile or graph, a Player Comparison card, Explorer's Mins filter, Team Building's Min minutes). */
export function userMinimumNote(minMinutes: number, mode: AnalysisMode | null): string {
  const historic = mode === "historicAverage" ? ` Historic Average also counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes.` : "";
  return `Your minimum minutes: ${fmtDecimal(minMinutes, 0)}. A player under it, or with no minutes (counted as 0), is left out or marked.${historic}`;
}

/** Hover text for the amber badge on a player below a Player Comparison card's own Min Minutes (a custom view). `minutes` null: no figures for the mode, counted as 0. */
export function belowMinimumNote(minutes: number | null, minMinutes: number): string {
  const played = minutes === null ? "no minutes in this mode (counts as 0)" : `${fmtDecimal(minutes, 0)} min in this mode`;
  return `Below this card's Min Minutes: ${played}, under ${fmtDecimal(minMinutes, 0)}: not drawn, not ranked or marked best.`;
}

/**
 * Hover text for a Dashboard tile or graph, or null when no threshold
 * applies to it. `playerFloor`: the Starter view leaves players under the
 * fixed floor out; `userMinimum`: the item's own Min Minutes (when above
 * 0); `historicSeasons`: Historic Average counts only seasons that reach
 * the floor.
 */
export function dashboardFloorNote(
  mode: AnalysisMode,
  { playerFloor, userMinimum = 0, historicSeasons }: { playerFloor: boolean; userMinimum?: number; historicSeasons: boolean },
): string | null {
  const parts: string[] = [];
  if (playerFloor) parts.push(`only players with ${fixedFloorMinutes(mode)}+ minutes are included`);
  if (userMinimum > 0) parts.push(`your Min Minutes: only players with ${fmtDecimal(userMinimum, 0)}+ minutes are included (no minutes counts as 0)`);
  if (historicSeasons) parts.push(`Historic Average counts only seasons of ${FIXED_FLOOR_MINUTES}+ minutes`);
  if (parts.length === 0) return null;
  return `Minimum minutes applied: ${parts.join("; ")}.`;
}
