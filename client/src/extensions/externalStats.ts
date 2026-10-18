import { createContext, useContext, type ReactNode } from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { PlayerColumn } from "../components/playerColumns";
import type { TeamColumn } from "../components/teamColumns";

/**
 * The one slot through which a second data source (today: Understat, in
 * client/src/understat/) adds figures to FPL pages — without any FPL code
 * importing it. A page asks `useExternalStats()` for extra columns, and for
 * an alternative-source version of a column it already has (xG from
 * Understat instead of FPL); with no source mounted it gets null and
 * behaves exactly as it always has.
 *
 * <one_source_per_figure>: a column is one source end to end. An
 * alternative column replaces the FPL one whole — its value, rate, sort,
 * filter and tint — so no figure ever mixes the two sources.
 */

export interface ExternalColumnGroup<C> {
  /** Shown as the Columns picker heading. */
  heading: string;
  columns: C[];
}

export interface ExternalColumnSet<C> {
  groups: ExternalColumnGroup<C>[];
  /** FPL column key -> the same figure from this source (only for figures the two sources genuinely disagree on). */
  alternates: Record<string, C>;
}

export interface ExternalStatsSource {
  /** Stable id, used as the selected source value of a toggled column. */
  id: string;
  /** "Understat" */
  label: string;
  /** CSS class for this source's column headers and menu headings. */
  className: string;
  /** Picker-heading icon. */
  icon: ReactNode;
  /** "loading" | "ready" | "unavailable" (its data can't be reached; columns show "—"). */
  status: "loading" | "ready" | "unavailable";
  /** Hover text for a header when this source's figures are out of date or unavailable; null when all is well. */
  staleNote: string | null;
  /** Start loading on first use (call on mount; a no-op after the first call). */
  request: () => void;
  playerColumns: (mode: AnalysisMode) => ExternalColumnSet<PlayerColumn>;
  teamColumns: (mode: AnalysisMode) => ExternalColumnSet<TeamColumn>;
  /** The source's own User Guide section (what it is, its colour, its metrics), shown before "Data sourcing & known limitations". */
  guideSection: { id: string; navLabel: string; title: string; accentVar: string; body: ReactNode };
}

export const ExternalStatsContext = createContext<ExternalStatsSource | null>(null);

/** Null when no second source is mounted (or it's switched off). */
export function useExternalStats(): ExternalStatsSource | null {
  return useContext(ExternalStatsContext);
}

/** Which source a toggleable column is showing: "fpl", or an external source's id. */
export type ColumnSourceChoice = Record<string, string>;
export const FPL_SOURCE = "fpl";
