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

/** One extra column for a profile's Match Log, from a second source. */
export interface ExternalMatchColumn {
  key: string;
  header: string;
  /** Hover text on the header. */
  title?: string;
  /** The cell for one FPL fixture ("—" when the source has nothing for it). */
  cell: (fixtureId: number) => ReactNode;
  /** The Totals and Average rows' cells; left blank when omitted. */
  total?: ReactNode;
  average?: ReactNode;
  /** The Average cell's comparative colour (a CSS background), when the source ranks it. */
  averageTint?: string;
}

/**
 * The seasons a profile's Data View covers, as the FPL side works them out
 * (the profiles' own rules: a player's Historic Average counts only seasons
 * reaching the fixed minutes floor; a club's only seasons it was in the
 * league). One season, or a Historic Average's several.
 */
export interface ProfileView {
  mode: AnalysisMode;
  /** Null while the FPL side is still working them out (its history loading). */
  seasons: string[] | null;
}

/** What a second source adds to the player and team profiles. */
export interface ExternalProfiles {
  /** Fetch one player's or club's per-match figures for these seasons ("2025/26"); call from an effect. Loaded or loading seasons are skipped. */
  requestPlayer: (code: number, seasons: string[]) => void;
  requestClub: (code: number, seasons: string[]) => void;
  playerMatchColumns: (code: number, season: string) => ExternalMatchColumn[];
  /** `fixtureIds`: the matches the log lists, so a total is never a sum over only some of them. */
  clubMatchColumns: (code: number, season: string, fixtureIds: number[]) => ExternalMatchColumn[];
  /**
   * This source's version of Match Log figures both sources have, by the
   * log's column key (player: min, a, xg, xa, xgi; club: a, xg, xa, xgi,
   * xgc) — what a column's ⇄ toggle switches to, whole column, Totals and
   * Average included (<one_source_per_figure>). A player's `matches` carry
   * FPL's minutes, so a match he didn't play is a provable 0 and one he did
   * with no figure from this source is "—".
   */
  playerMatchAlternates: (code: number, season: string, matches: { fixtureId: number; minutes: number }[]) => Record<string, ExternalMatchColumn>;
  clubMatchAlternates: (code: number, season: string, fixtureIds: number[]) => Record<string, ExternalMatchColumn>;
  /** The source's own profile cards for a Data View (each a `.card`). */
  playerCards: (code: number, view: ProfileView) => ReactNode;
  clubCards: (code: number, view: ProfileView) => ReactNode;
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
  profiles: ExternalProfiles;
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
