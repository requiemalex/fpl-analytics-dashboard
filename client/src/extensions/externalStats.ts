import { createContext, useContext, type ReactNode } from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { PlayerColumn } from "../components/playerColumns";
import type { TeamColumn } from "../components/teamColumns";
import type { Position } from "../types/normalized";
import type { SummaryTileConfig } from "../state/useSummaryTiles";
import type { DashboardGraphConfig } from "../state/useDashboardGraphs";
import type { HelpGuide } from "../help/types";

/**
 * The one slot through which a second data source (today: Understat, in
 * client/src/understat/) adds figures to FPL pages — without any FPL code
 * importing it. A page asks `useExternalStats()` for extra columns, and for
 * an alternative-source version of a column it already has (xG from
 * Understat instead of FPL); with no source mounted it gets null and
 * behaves exactly as it always has. The Dashboard and Player Comparison
 * use the same columns the same way — the source's own figures saved as
 * an external metric key (<external_metric_key> below), and a ⇄ toggle on
 * the figures both sources have — and Player Comparison's trend graphs its
 * season-by-season figures (`playerTrends`).
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
  /** Hover text on the header: what the figure is, and the first line of every cell's hover (<stat_hover>). */
  title?: string;
  /** The cell for one FPL fixture ("—" when the source has nothing for it). */
  cell: (fixtureId: number) => ReactNode;
  /** The Totals and Average rows' cells; left blank when omitted. */
  total?: ReactNode;
  average?: ReactNode;
  /** The Totals and Average cells' comparative colours (CSS backgrounds, <comparative_colouring>), when the source ranks them. */
  totalTint?: string;
  averageTint?: string;
  /**
   * The ranks behind the hovers (<stat_hover>), as percentiles (higher
   * better) for the profile to put in words: Totals' and Average's (the
   * ones behind their tints), and one match's against the pool the Average
   * is ranked in. Null or omitted: no rank.
   */
  totalRank?: number | null;
  averageRank?: number | null;
  cellRank?: (fixtureId: number) => number | null;
  /** Totals' and Average's note when they're from only some of the listed matches (<partial_totals>), for their hover. */
  totalNote?: string;
  averageNote?: string;
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

/** One figure a Player Comparison trend graph can plot, season by season, from a second source. */
export interface ExternalTrendMetric {
  /** Unique within the source; saved as externalMetricKey(source id, key). */
  key: string;
  label: string;
  decimals: number;
  /** A player's figure (FPL permanent `code`) for one completed season ("2024/25"); null (a gap in his line, never 0) when the source has none. */
  value: (code: number, season: string) => number | null;
}

/** What a second source adds to the player and team profiles. */
export interface ExternalProfiles {
  /** Fetch one player's or club's per-match figures for these seasons ("2025/26"); call from an effect. Loaded or loading seasons are skipped. */
  requestPlayer: (code: number, seasons: string[]) => void;
  requestClub: (code: number, seasons: string[]) => void;
  playerMatchColumns: (code: number, season: string) => ExternalMatchColumn[];
  /** `fixtureIds`: the matches the log lists. Totals and Average cover those the source has a figure for, and say so on hover when that's only some. */
  clubMatchColumns: (code: number, season: string, fixtureIds: number[]) => ExternalMatchColumn[];
  /**
   * This source's version of Match Log figures both sources have, by the
   * log's column key (player: min, a, xg, xa, xgi, xgc; club: a, xg, xa, xgi,
   * xgc) — what a column's ⇄ toggle switches to, whole column, Totals and
   * Average included (<one_source_per_figure>). A player's `matches` carry
   * FPL's minutes, so a match he didn't play is a provable 0 and one he did
   * with no figure from this source is "—", left out of Totals and Average
   * (not counted as 0).
   */
  playerMatchAlternates: (code: number, season: string, matches: { fixtureId: number; minutes: number }[]) => Record<string, ExternalMatchColumn>;
  clubMatchAlternates: (code: number, season: string, fixtureIds: number[]) => Record<string, ExternalMatchColumn>;
  /** The source's own profile cards for a Data View (each a `.card`); a player's depend on his position (a defender's and goalkeeper's shots faced). */
  playerCards: (code: number, view: ProfileView, position: Position) => ReactNode;
  clubCards: (code: number, view: ProfileView) => ReactNode;
  /** A club's formations in `season` (the live one) — the Team Profile's own section, outside its Data View; loads what it needs itself. */
  clubFormations: (code: number, season: string) => ReactNode;
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
  /**
   * <source_starter_items>: the source's own tiles and graphs in the
   * Dashboard's Starter view, shown after the packaged FPL ones while the
   * source is mounted (none with it switched off or removed). Same shape
   * and rules as the packaged ones (Last Season, no criteria, the fixed
   * floor); ids unique to the source.
   */
  dashboardStarter: { tiles: SummaryTileConfig[]; graphs: DashboardGraphConfig[] };
  /**
   * <source_explorer_defaults>: keys of the source's own columns (its
   * groups' keys) shown by default in Player Explorer, Team Building's Add
   * Players and Team Explorer, after FPL's defaults, while the source is
   * mounted. Reset returns to them too.
   */
  explorerDefaults: { player: string[]; team: string[] };
  /** Player Comparison's trend graphs: the source's season-by-season figures — its own in picker groups, and its version of FPL trend figures (keyed by the FPL trend key) for their ⇄ toggle. */
  playerTrends: ExternalColumnSet<ExternalTrendMetric>;
  profiles: ExternalProfiles;
  /** The source's own Help guides (what it is, its colours, its toggle, its own sections), searched and listed with FPL's (help/HelpPanel.tsx). Its statistics get entries from its columns. */
  helpGuides: HelpGuide[];
}

export const ExternalStatsContext = createContext<ExternalStatsSource | null>(null);

/** Null when no second source is mounted (or it's switched off). */
export function useExternalStats(): ExternalStatsSource | null {
  return useContext(ExternalStatsContext);
}

/** Which source a toggleable column is showing: "fpl", or an external source's id. */
export type ColumnSourceChoice = Record<string, string>;
export const FPL_SOURCE = "fpl";

/**
 * <external_metric_key>: how a saved Dashboard tile or graph, or a Player
 * Comparison card, names one of a second source's own figures (one FPL
 * doesn't have) — "<source id>:<its column key>" ("understat:us.shots").
 * An FPL figure keeps its plain key (no FPL key has a ":"), so every item
 * saved before keeps its meaning. A figure both sources have (xG…) is
 * saved by its FPL key and switched with its ⇄ toggle, exactly as an
 * Explorer column is (<same_toggle_everywhere>): starts on FPL each visit,
 * and switches the whole figure — value, colour, scale — so one figure is
 * always one source end to end (<one_source_per_figure>). With the source
 * switched off an item of its own figures can't be shown, and says so
 * (externalMetricUnavailable); a switched figure goes back to FPL.
 */
export function externalMetricKey(sourceId: string, key: string): string {
  return `${sourceId}:${key}`;
}

/** The source id and its own key, for an external metric key; null for an FPL key. */
export function parseExternalMetricKey(key: string): { sourceId: string; key: string } | null {
  const i = key.indexOf(":");
  return i > 0 ? { sourceId: key.slice(0, i), key: key.slice(i + 1) } : null;
}

/** One of a second source's own figures (one FPL doesn't have) by its key — what an external metric key names. Its version of an FPL figure is reached through that figure's ⇄ toggle instead (`alternates`). */
export function externalColumnByKey<C extends { key: string }>(set: ExternalColumnSet<C>, key: string): C | undefined {
  return set.groups.flatMap((g) => g.columns).find((c) => c.key === key);
}

/** The picker heading one of a source's own figures sits under ("Understat · Shooting"), for an Outputs panel's sections. */
export function externalMetricHeading<C extends { key: string }>(source: Pick<ExternalStatsSource, "label">, set: ExternalColumnSet<C>, key: string): string {
  return set.groups.find((g) => g.columns.some((c) => c.key === key))?.heading ?? source.label;
}

/**
 * A figure's name with its source spelled out, "xG (Understat)" — only in a
 * CSV export's header, which has no colour or icon. In the app a second
 * source's figure is never named so: its colour and icon say it (owner's
 * decision, 2026-10-24).
 */
export function externalLabel(source: Pick<ExternalStatsSource, "label">, label: string): string {
  return `${label} (${source.label})`;
}

/** The message on an item whose figure comes from a second source that isn't mounted (switched off, or removed). */
export function externalMetricUnavailable(noun: string): string {
  return `This ${noun} uses figures from a second data source that's switched off.`;
}

/** A card's empty message while the second source its figures come from is loading or couldn't be loaded; undefined when it's ready. */
export function externalLoadMessage(source: Pick<ExternalStatsSource, "label" | "status">): string | undefined {
  if (source.status === "loading") return `Loading ${source.label} data…`;
  if (source.status === "unavailable") return `${source.label} data couldn't be loaded.`;
  return undefined;
}
