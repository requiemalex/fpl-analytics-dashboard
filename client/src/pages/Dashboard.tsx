import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { clubRanks, colourDirection, positionRanks } from "../metrics/comparativeColour";
import { FIXED_FLOOR_LIVE_MINUTES, FIXED_FLOOR_MINUTES, fixedFloorMinutes } from "../metrics/fixedMinutesFloor";
import { dashboardFloorNote, isSmallSample, smallSampleNote } from "../components/MinutesFloorBadge";
import { useHiddenSmallSamples } from "../state/useHiddenSmallSamples";
import { filterPlayers } from "../state/useFilteredPlayers";
import { computeTeamAggregates, type TeamAggregate } from "../metrics/teamStats";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { DATA_VIEW_SEGMENTS } from "../components/AnalysisModeToggle";
import { MAX_NAME_LENGTH, MenuGroupHeading, SegmentedControl, fplHeading, type SegmentOption } from "../components/MenuControls";
import { FiltersBar } from "../components/FiltersBar";
import { CardEditRemoveButtons, CreateViewIcon, FilterIcon, PlusIcon, TrashIcon, TrendLineIcon } from "../components/IconToolbar";
import { SectionHeading } from "../components/SectionHeading";
import { PlayerSearch } from "../components/PlayerSearch";
import { TeamPicker } from "../components/TeamPicker";
import { TopList, type TopListRow } from "../components/TopList";
import { TeamTopList, type TeamTopListRow } from "../components/TeamTopList";
import { DashboardGraphCard } from "../components/DashboardGraphCard";
import type { ScatterPoint } from "../components/charts/ScatterWithReference";
import { rankBars, type BarDatum } from "../components/charts/BarTopN";
import { PLAYER_COLUMNS, columnByKey as playerColumnByKey, columnFormatForMode, columnForMode, type PlayerColumn } from "../components/playerColumns";
import { TEAM_COLUMNS, currentTeamMetricKey, teamColumnByKey, teamColumnFormatForMode, teamColumnForMode, type TeamColumn } from "../components/teamColumns";
import {
  PLAYER_TILE_METRICS,
  TEAM_TILE_METRICS,
  playerTileMetricByKey,
  playerTileMetricFromColumn,
  teamTileMetricByKey,
  teamTileMetricFromColumn,
  type PlayerTileMetric,
  type SummaryTileScope,
  type TeamTileMetric,
} from "../components/summaryTileMetrics";
import { cardSource, CrossoverGroupHeading, SourceMark } from "../components/SourceToggle";
import { GroupedPicker, type PickerGroup } from "../components/GroupedPicker";
import {
  externalColumnByKey,
  externalLoadMessage,
  externalMetricKey,
  externalMetricUnavailable,
  parseExternalMetricKey,
  useExternalStats,
  type ExternalColumnGroup,
  type ExternalColumnSet,
  type ExternalStatsSource,
  type ColumnSourceChoice,
  FPL_SOURCE,
} from "../extensions/externalStats";
import { useSummaryTiles, createSummaryTile, MAX_SUMMARY_TILES, type TileDirection, type SummaryTileConfig } from "../state/useSummaryTiles";
import {
  useDashboardGraphs,
  createDashboardGraph,
  defaultGraphDirection,
  MAX_DASHBOARD_GRAPHS,
  type DashboardGraphType,
  type DashboardGraphConfig,
} from "../state/useDashboardGraphs";
import { useSavedDashboardViews, isDefaultSavedView, isDefaultViewSelected, MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE, type SavedDashboardView } from "../state/useSavedDashboardViews";
import { fmtDate } from "../utils/format";
import { useEscapeLayer } from "../state/useEscapeLayer";
import type { NormalizedPlayer } from "../types/normalized";

/**
 * What one tile or graph metric key shows in a Data View, the Explorers'
 * way (<same_toggle_everywhere>): an FPL figure (a plain key) — switched to
 * a second source's version by the item's ⇄ toggle when it has one
 * (`switched`) — or one of that source's own figures (<external_metric_key>),
 * its column through the slot. One source per figure
 * (<one_source_per_figure>). Null when this version can't show it.
 */
interface ItemMetric<M> {
  metric: M;
  /** As the item's Data View shows it (<averaged_counts>). */
  format: (v: number | null) => string;
  /** The second source it comes from; null for FPL. */
  source: ExternalStatsSource | null;
  /** The figure's own name, without the source (the toggle's and badge's hover use these). */
  figure: string;
  /** A figure both sources have: what the item's ⇄ toggle switches. */
  crossover: boolean;
}

function externalSourceFor(key: string, ext: ExternalStatsSource | null): { source: ExternalStatsSource; key: string } | null | "off" {
  const parsed = parseExternalMetricKey(key);
  if (!parsed) return null;
  return ext && ext.id === parsed.sourceId ? { source: ext, key: parsed.key } : "off";
}

/** Whether a key names a second source's own figure while that source isn't mounted (switched off). */
function sourceOff(key: string, ext: ExternalStatsSource | null): boolean {
  return externalSourceFor(key, ext) === "off";
}

/**
 * The column a key shows from a second source's set: one of its own
 * figures, or — switched — its version of an FPL figure. Also whether the
 * FPL figure has such a version (a ⇄ one). "off": its own figure, with the
 * source not mounted.
 */
function externalColumnFor<C extends { key: string }>(
  key: string,
  alternateKey: string,
  ext: ExternalStatsSource | null,
  setFor: (ext: ExternalStatsSource) => ExternalColumnSet<C>,
  switched: boolean,
): { column: C | undefined; crossover: boolean } | "off" {
  const external = externalSourceFor(key, ext);
  if (external === "off") return "off";
  if (external) return { column: externalColumnByKey(setFor(external.source), external.key), crossover: false };
  const alternate = ext ? setFor(ext).alternates[alternateKey] : undefined;
  return { column: switched ? alternate : undefined, crossover: !!alternate };
}

export function resolvePlayerTileMetric(key: string, mode: AnalysisMode, ext: ExternalStatsSource | null, switched = false): ItemMetric<PlayerTileMetric> | null {
  const found = externalColumnFor(key, key, ext, (e) => e.playerColumns(mode), switched);
  if (found === "off") return null;
  if (found.column && ext) {
    const shown = columnForMode(found.column, mode);
    return { metric: playerTileMetricFromColumn(shown, key, shown.label), format: shown.format, source: ext, figure: shown.label, crossover: found.crossover };
  }
  if (parseExternalMetricKey(key)) return null;
  const metric = playerTileMetricByKey(key);
  return metric ? { metric, format: columnFormatForMode(key, metric.format, mode), source: null, figure: metric.label, crossover: found.crossover } : null;
}

export function resolveTeamTileMetric(key: string, mode: AnalysisMode, ext: ExternalStatsSource | null, switched = false): ItemMetric<TeamTileMetric> | null {
  const found = externalColumnFor(key, currentTeamMetricKey(key), ext, (e) => e.teamColumns(mode), switched);
  if (found === "off") return null;
  if (found.column && ext) {
    const shown = teamColumnForMode(found.column, mode);
    return { metric: teamTileMetricFromColumn(shown, key, shown.label), format: shown.format, source: ext, figure: shown.label, crossover: found.crossover };
  }
  if (parseExternalMetricKey(key)) return null;
  const metric = teamTileMetricByKey(key);
  return metric ? { metric, format: teamColumnFormatForMode(metric.key, metric.format, mode), source: null, figure: metric.label, crossover: found.crossover } : null;
}

/** A graph axis's column as its Data View shows it (a second source's axis name in its colour: axisClass). */
export function resolvePlayerGraphColumn(key: string, mode: AnalysisMode, ext: ExternalStatsSource | null, switched = false): ItemMetric<PlayerColumn> | null {
  const found = externalColumnFor(key, key, ext, (e) => e.playerColumns(mode), switched);
  if (found === "off") return null;
  const column = found.column ?? (parseExternalMetricKey(key) ? undefined : playerColumnByKey(key));
  if (!column) return null;
  const shown = columnForMode(column, mode);
  return { metric: shown, format: shown.format, source: found.column ? ext : null, figure: shown.label, crossover: found.crossover };
}

export function resolveTeamGraphColumn(key: string, mode: AnalysisMode, ext: ExternalStatsSource | null, switched = false): ItemMetric<TeamColumn> | null {
  const found = externalColumnFor(key, currentTeamMetricKey(key), ext, (e) => e.teamColumns(mode), switched);
  if (found === "off") return null;
  const column = found.column ?? (parseExternalMetricKey(key) ? undefined : teamColumnByKey(key));
  if (!column) return null;
  const shown = teamColumnForMode(column, mode);
  return { metric: shown, format: shown.format, source: found.column ? ext : null, figure: shown.label, crossover: found.crossover };
}

/** An axis's name is the figure's alone, never "(Understat)": a second source's is drawn in that source's colour (the colour index), as its card's icon and title say. Its class, or undefined for FPL's. */
function axisClass(r: ItemMetric<unknown> | null | undefined): string | undefined {
  return r?.source?.className;
}

/** The Starter view as shown: the packaged FPL tiles and graphs, then the second source's own (<source_starter_items>). Any other view as saved. */
export function withSourceStarterItems(view: SavedDashboardView, ext: Pick<ExternalStatsSource, "dashboardStarter"> | null): SavedDashboardView {
  if (!ext || !isDefaultSavedView(view)) return view;
  const { tiles, graphs } = ext.dashboardStarter;
  return {
    ...view,
    tiles: [...view.tiles, ...tiles.filter((t) => t.scope === view.scope)],
    graphs: [...view.graphs, ...graphs.filter((g) => g.scope === view.scope)],
  };
}

/** Whether a saved tile or graph shows one of a second source's own figures. */
function usesExternalMetric(item: { metricKey: string } | { chartType: DashboardGraphType; xMetricKey: string; yMetricKey: string }): boolean {
  if ("metricKey" in item) return parseExternalMetricKey(item.metricKey) !== null;
  return parseExternalMetricKey(item.yMetricKey) !== null || (item.chartType === "scatter" && parseExternalMetricKey(item.xMetricKey) !== null);
}

/**
 * A tile's or graph's source mark, first in its header (<card_source_mark>,
 * SourceMark): FPL's icon, Understat's, or the ⇄. Its ⇄ is a toggle where
 * a figure on it is one both sources have (one per card: a tile has one
 * figure, and a graph's axis names are drawn inside the chart, so it
 * switches every such figure on it together).
 */
function itemSourceControls(ext: ExternalStatsSource | null, metrics: (ItemMetric<unknown> | null | undefined)[], switched: boolean, onToggle: () => void): React.ReactNode {
  const shown = metrics.filter((m): m is ItemMetric<unknown> => !!m);
  return <SourceMark items={shown} toggle={ext ? { switched, onToggle, externalLabel: ext.label } : null} />;
}

/** A second source's part of the pickers (pickerGroups, in the page). */
interface ExternalPickerGroups {
  sourceId: string;
  label: string;
  icon: React.ReactNode;
  className: string;
  crossover: Set<string>;
  groups: ExternalColumnGroup<{ key: string; label: string }>[];
}

/**
 * The Statistic / axis picker's groups, headed exactly as the Explorers'
 * Columns picker is (<same_toggle_everywhere>, MenuGroupHeading): green
 * "FPL ·" groups of FPL-only figures, with their icons; with a second
 * source mounted, one rose "FPL & <source>" group of the figures both have
 * (⇄ on the card), then the source's own groups in its colour.
 */
export function metricPickerGroups(fpl: { key: string; label: string; group?: string }[], external: ExternalPickerGroups | null): PickerGroup[] {
  const crossover = external?.crossover ?? new Set<string>();
  const groupOf = (m: { group?: string }) => m.group ?? "Other";
  const toOption = (m: { key: string; label: string }) => ({ value: m.key, label: m.label });
  const fplGroups: PickerGroup[] = [...new Set(fpl.map(groupOf))].map((g) => ({
    key: `fpl:${g}`,
    label: fplHeading(g),
    heading: <MenuGroupHeading group={g} label={fplHeading(g)} className="col-source-fpl" />,
    options: fpl.filter((m) => groupOf(m) === g && !crossover.has(m.key)).map(toOption),
  }));
  if (!external) return fplGroups;
  return [
    ...fplGroups,
    {
      key: "crossover",
      label: `FPL & ${external.label}`,
      heading: <CrossoverGroupHeading externalLabel={external.label} />,
      options: fpl.filter((m) => crossover.has(m.key)).map(toOption),
    },
    ...external.groups.map((g) => ({
      key: `${external.sourceId}:${g.heading}`,
      label: g.heading,
      heading: <MenuGroupHeading group={g.heading} label={g.heading} icon={external.icon} className={external.className} />,
      options: g.columns.map((c) => ({ value: externalMetricKey(external.sourceId, c.key), label: c.label })),
    })),
  ];
}

/** Same cap for both, and reused for graphs too (see MAX_TILE_PLAYERS/MAX_TILE_TEAMS usage below) — a tile or graph tracking a handful of specific players/teams is meant for close comparison, not a second way to build a big list. */
const MAX_TILE_PLAYERS = 5;
const MAX_TILE_TEAMS = 5;

const ORDER_SEGMENTS: SegmentOption<TileDirection>[] = [
  { value: "desc", label: "Highest First" },
  { value: "asc", label: "Lowest First" },
];
const GRAPH_TYPE_SEGMENTS: SegmentOption<DashboardGraphType>[] = [
  { value: "scatter", label: "Scatter Plot", title: "Scatter Plot: one metric against another" },
  { value: "bar", label: "Bar Chart", title: "Bar Chart: the top 15 by one metric" },
];

/** Every mode a tile can be built from — used to pre-compute one resolved/eligible/aggregate bucket per mode (see below), since tiles now each carry their own data view rather than sharing one page-wide mode. */
const MODES: AnalysisMode[] = ["live", "lastSeason", "historicAverage"];

// The packaged Default view is a fixed-floor section (the minimum-minutes
// principle, <fixed_minutes_floor>): the user can't edit its criteria, so
// every player tile and graph in it leaves out players under the app-wide
// fixed floor — totals as well as per-game rates, so a cameo can't top a
// per-game list and every Default ranking and plot is built the same way.
// A tile or graph the user builds has its own Min Minutes instead. Never
// applied to specifically picked players.
export const LIVE_DEFAULT_VIEW_MIN_MINUTES = FIXED_FLOOR_LIVE_MINUTES;
export const DEFAULT_VIEW_MIN_MINUTES = FIXED_FLOOR_MINUTES;

export function applyDefaultViewFloor(players: NormalizedPlayer[], dataView: AnalysisMode): NormalizedPlayer[] {
  const floor = fixedFloorMinutes(dataView);
  return players.filter((p) => p.minutes !== null && p.minutes >= floor);
}

/**
 * The players one player-scope tile or graph ranks or plots: its picked
 * players if it has a picked list (no criteria, no floor), otherwise its
 * criteria applied to the pool — plus the fixed floor when the packaged
 * Default view is the one on screen (see applyDefaultViewFloor above).
 *
 * A picked list is never empty when saved (the dialog requires a player);
 * only the season-id rollover can empty one, when every picked player has
 * left FPL. That still means "these players", so nobody, never the whole
 * league (audit 2026-10-18 R2). The same holds for a team item's teamIds.
 */
export function playersForDashboardItem(
  item: { dataView: AnalysisMode; criteria: GlobalScoutingFilters | null; playerIds: number[] | null },
  pool: NormalizedPlayer[],
  { defaultViewShown }: { defaultViewShown: boolean },
): NormalizedPlayer[] {
  if (item.playerIds !== null) {
    const idSet = new Set(item.playerIds);
    return pool.filter((p) => idSet.has(p.id));
  }
  const players = filterPlayers(pool, item.criteria ?? DEFAULT_FILTERS);
  return defaultViewShown ? applyDefaultViewFloor(players, item.dataView) : players;
}

/**
 * The hover text for a player-scope tile or graph's amber stopwatch
 * (<minutes_marker>), or null when no minimum-minutes threshold applies to
 * it: the Starter view's fixed floor, the item's own Min Minutes when it's
 * above 0, and Historic Average's 450-minute seasons (every Historic
 * Average item, in any view). Picked players are never floored, but a
 * Historic Average of theirs still counts only 450+ seasons.
 */
export function dashboardItemFloorNote(
  item: { dataView: AnalysisMode; playerIds: number[] | null; criteria?: GlobalScoutingFilters | null },
  { defaultViewShown }: { defaultViewShown: boolean },
): string | null {
  const picked = item.playerIds !== null;
  return dashboardFloorNote(item.dataView, {
    playerFloor: defaultViewShown && !picked,
    userMinimum: picked ? 0 : (item.criteria?.minMinutes ?? 0),
    historicSeasons: item.dataView === "historicAverage",
  });
}

/**
 * A player tile's colours (<comparative_colouring>): every player ranked
 * within his position among the tile's whole pool for its Data View — not
 * only the rows its criteria or picked players leave — anyone under the
 * fixed floor uncoloured.
 */
export function playerTileRanks(metric: PlayerTileMetric, pool: NormalizedPlayer[], dataView: AnalysisMode): Map<number, number> {
  const higherIsBetter = colourDirection(metric);
  if (higherIsBetter === null) return new Map();
  const value = metric.rankBy ?? metric.getValue;
  return positionRanks(pool, {
    id: (p) => p.id,
    position: (p) => p.position,
    minutes: (p) => p.minutes,
    mode: dataView,
    value: (p) => value(p, getPlayerDerivedMetrics(p)),
    higherIsBetter,
  });
}

export function topN<T extends { value: number | null }>(rowsIn: T[], n: number, ascending = false): T[] {
  const eligible = rowsIn.filter((r) => r.value !== null) as (T & { value: number })[];
  eligible.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  return eligible.slice(0, n);
}

/**
 * A tile's custom name if it has one, else its metric's name, plus its
 * order when that runs against the metric's natural one ("Lowest First" for
 * a higher-is-better metric, "Highest First" for a lower-is-better one):
 * otherwise a Highest First and a Lowest First tile of one metric (the two
 * Starter "Goals vs xG" tiles) shared a title, told apart only by their
 * signs (audit 2026-10-18 L1). A tile in its natural order needs no
 * suffix: "League Position · Lowest First" read as the bottom of the table
 * when it lists the top (audit 2026-10-23 in-app).
 */
export function displayTileTitle(tile: Pick<SummaryTileConfig, "name" | "direction">, metricLabel: string, higherIsBetter = true): string {
  if (tile.name && tile.name.trim()) return tile.name;
  const natural = higherIsBetter ? "desc" : "asc";
  if (tile.direction === natural) return metricLabel;
  return `${metricLabel} · ${tile.direction === "asc" ? "Lowest First" : "Highest First"}`;
}

/** A scatter graph is "<X> vs <Y>"; a bar graph is just its metric's name. */
function graphTitle(graph: DashboardGraphConfig, xLabel: string, yLabel: string): string {
  return graph.chartType === "scatter" ? `${xLabel} vs ${yLabel}` : yLabel;
}

/** A graph's custom name (set in the Add/Edit dialog) if it has one, else the auto-generated "<X> vs <Y>" / "<Y>" title. */
function displayGraphTitle(graph: DashboardGraphConfig, xLabel: string, yLabel: string): string {
  return graph.name && graph.name.trim() ? graph.name : graphTitle(graph, xLabel, yLabel);
}

/** Why a Filters-mode price range can't be saved, if it can't. */
function priceRangeProblem(criteria: GlobalScoutingFilters): string | undefined {
  if (criteria.minPrice != null && criteria.maxPrice != null && criteria.minPrice > criteria.maxPrice) return "Min price is above max price";
  return undefined;
}

type GameweekDisplay = { heading: string; sub: string; progress: number | null };

/**
 * The Gameweek Status card. FPL marks an event "current" once its deadline
 * passes and keeps it current until the NEXT deadline passes — even after
 * its own matches have finished (same reasoning as AppShell's
 * getGameweekInfo). So a current event's own deadline is always in the
 * past: while it's being played the card says so and counts down to the
 * next deadline; once finished it switches to the next gameweek.
 */
export function gameweekDisplay(
  gameweekState: ReturnType<typeof useAppState>["gameweekState"],
  events: ReturnType<typeof useAppState>["events"],
): GameweekDisplay {
  if (gameweekState?.kind === "current") {
    const current = gameweekState.event;
    const next = events.find((e) => e.isNext);
    if (current.finished) {
      if (!next) return { heading: current.name, sub: "Finished, awaiting the next gameweek", progress: null };
      return { heading: next.name, sub: `Deadline ${fmtDate(next.deadlineTime)}`, progress: timeProgressPercent(current.deadlineTime, next.deadlineTime) };
    }
    if (!next) return { heading: current.name, sub: "In progress", progress: null };
    return {
      heading: current.name,
      sub: `In progress · next deadline ${fmtDate(next.deadlineTime)}`,
      progress: timeProgressPercent(current.deadlineTime, next.deadlineTime),
    };
  }
  if (gameweekState?.kind === "last-completed") {
    return { heading: gameweekState.event.name, sub: "Last completed gameweek", progress: null };
  }
  return { heading: "Pre-season", sub: "No active gameweek yet", progress: null };
}

/** Stand-in for a saved tile or graph whose statistic this version doesn't have (e.g. one removed in an update, or from a second source that's switched off) — says so and can still be removed, rather than vanishing while still counting toward the cap. */
function UnavailableItemCard({ title, noun, onRemove, minHeight, sourceOff }: { title: string; noun: "tile" | "graph"; onRemove?: () => void; minHeight?: number; sourceOff?: boolean }) {
  return (
    <div className="card" style={minHeight ? { minHeight } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="card-title">{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <CardEditRemoveButtons noun={noun} onRemove={onRemove} />
        </div>
      </div>
      <p className="page-subtitle" style={{ margin: 0 }}>
        {sourceOff ? externalMetricUnavailable(noun) : `This ${noun}'s statistic is no longer available.`}
      </p>
    </div>
  );
}

/** % of the way from `startISO` to `endISO` the current moment is, clamped to [0, 100] — null if the window is malformed (end <= start), so the caller can just hide the bar rather than showing something nonsensical. */
function timeProgressPercent(startISO: string, endISO: string): number | null {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (!(end > start)) return null;
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

/** Header view toggle: a two-person mark for "Players". */
function PlayersViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.6 14c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.6" cy="6.2" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.3 9.3c1.9-.2 3.7.9 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Header view toggle — a club-badge/shield silhouette, pairing with PlayersViewIcon above for "Teams". */
function TeamsViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5 13.5 3.5V7.5C13.5 11 11.2 13.4 8 14.5C4.8 13.4 2.5 11 2.5 7.5V3.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Add Player Tile's "Player Search" toggle icon — plain magnifying glass, paired with FilterIcon's funnel for "Filters". */
function PlayerSearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.9" y1="9.9" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Add Team Tile's "All Teams" toggle icon — a 2x2 grid standing for "every team", paired with TargetIcon for "Team Selection". */
function AllTeamsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Add Team Tile's "Team Selection" toggle icon — a target, standing for picking specific ones out of the full set above. */
function TeamSelectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.3" fill="currentColor" />
    </svg>
  );
}

export function Dashboard() {
  const {
    players,
    teams,
    gameweekState,
    events,
    historicProfiles,
    historicStatus,
    historicErrorMessage,
    historicSkippedPlayerIds,
    historicFetchSkippedPlayerIds,
    refreshHistoricData,
    historicRefreshing,
    currentSeasonHasStarted,
    requestHistoricData,
    clubSeasons,
    historicReferenceSeason,
  } = useAppState();
  const [, setSearchParams] = useSearchParams();
  // A second data source (Understat), when one is mounted: a tile or graph
  // can show its figures (<external_metric_key>). Loaded only once an item
  // on either side uses one.
  const ext = useExternalStats();

  // Tiles resolve lastSeason/historicAverage data for every mode up front
  // (see resolvedByMode below), so this page always needs the whole-pool
  // historic dataset — request it on mount rather than relying on
  // AppStateContext to fetch it unconditionally for every page.
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);

  // Which set of tiles is on screen — Player or Team. Each scope has its
  // own tiles (tilesState.tiles already carries a `scope` per tile); this
  // just controls which are rendered/added at once, matching the same
  // split Add Tile always had, but as a toggle instead of two permanently
  // stacked sections.
  const [tileView, setTileView] = useState<SummaryTileScope>("player");

  // ---------- Per-mode data, computed once for all three modes ----------
  //
  // Tiles used to share one dashboard-wide analysis mode. Now each tile
  // picks its own "data view" at creation time (see useSummaryTiles.ts),
  // so instead of resolving the player pool once, it's resolved once PER
  // MODE — there are only three, and this keeps every tile's own pipeline
  // (resolve -> criteria filter -> rate-stat floor -> aggregate) exactly
  // as correct per-mode as the old single-mode version was, just indexed
  // by AnalysisMode instead of implicit in one shared variable.
  const resolvedByMode = useMemo(() => {
    const map = {} as Record<AnalysisMode, ReturnType<typeof resolvePlayerStatsList>["resolved"]>;
    for (const mode of MODES) map[mode] = resolvePlayerStatsList(players, mode, historicProfiles, currentSeasonHasStarted).resolved;
    return map;
  }, [players, historicProfiles, currentSeasonHasStarted]);

  // Club figures per mode — same shared computation Teams and Team Profile
  // use (<club_not_squad>, metrics/teamStats.ts): what each club did in
  // the season(s) a tile/graph's own Data View selects, league table
  // included, never a sum over today's squad.
  const teamAggregatesByMode = useMemo(() => {
    const ctx = { clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted, livePlayerSumsPartial: historicFetchSkippedPlayerIds.length > 0 };
    const map = {} as Record<AnalysisMode, TeamAggregate[]>;
    for (const mode of MODES) map[mode] = computeTeamAggregates(teams, mode, ctx);
    return map;
  }, [teams, clubSeasons, historicReferenceSeason, currentSeasonHasStarted, historicFetchSkippedPlayerIds]);

  // ---------- Summary Tiles ----------
  //
  // User-built and user-ordered, persisted to localStorage (useSummaryTiles)
  // — starts out matching the fixed leaderboards this page always showed,
  // so nothing changes for anyone until they open "+ Add Tile" themselves.
  const tilesState = useSummaryTiles();
  const [dragOverTileId, setDragOverTileId] = useState<string | null>(null);
  const [showAddTileModal, setShowAddTileModal] = useState(false);
  const [newTileMetricKey, setNewTileMetricKey] = useState<string>(PLAYER_TILE_METRICS[0].key);
  const [newTileDirection, setNewTileDirection] = useState<TileDirection>("desc");
  const [newTileDataView, setNewTileDataView] = useState<AnalysisMode>("lastSeason");
  const [newTileName, setNewTileName] = useState("");
  // This tile's own Search/Position/Team/Min Minutes criteria — set once
  // here at creation (like every other tile property), not shared with
  // any other tile. Only meaningful for scope "player"; a team tile
  // always aggregates a club's whole squad regardless of this.
  const [newTileCriteria, setNewTileCriteria] = useState<GlobalScoutingFilters>(DEFAULT_FILTERS);
  // Player Tile only — toggles between the Filters criteria above and
  // tracking up to MAX_TILE_PLAYERS specific players by id. Switching back
  // to "filters" clears newTilePlayerIds (see togglePlayerTileMode) so
  // half-built player picks never silently linger into a filter-based tile.
  const [newTilePlayerMode, setNewTilePlayerMode] = useState<"filters" | "players">("filters");
  const [newTilePlayerIds, setNewTilePlayerIds] = useState<number[]>([]);
  // Team Tile only — same idea as newTilePlayerMode/newTilePlayerIds above,
  // but for tracking up to MAX_TILE_TEAMS specific teams instead of every
  // team.
  const [newTileTeamMode, setNewTileTeamMode] = useState<"all" | "selected">("all");
  const [newTileTeamIds, setNewTileTeamIds] = useState<number[]>([]);
  const [newTileError, setNewTileError] = useState<string | null>(null);
  // Set while the Add Tile dialog is editing an existing tile (opened from
  // its Edit icon) rather than adding a new one — same dialog, same fields,
  // just prefilled, and saving replaces that tile in place.
  const [editingTileId, setEditingTileId] = useState<string | null>(null);

  // ---------- Graphs ----------
  //
  // Same idea as Summary Tiles above (user-built, user-ordered, persisted
  // to localStorage via useDashboardGraphs), one screen-space size class up
  // — a graph is configured in the Add Graph dialog (and changed later by
  // reopening it via the card's Edit icon), same as a tile, not left
  // permanently editable inline the way the old Underlying Numbers "User
  // Analysis" graphs were.
  const graphsState = useDashboardGraphs();
  const hiddenSmallSamples = useHiddenSmallSamples();
  const [dragOverGraphId, setDragOverGraphId] = useState<string | null>(null);
  const [showAddGraphModal, setShowAddGraphModal] = useState(false);
  const [newGraphName, setNewGraphName] = useState("");
  const [newGraphChartType, setNewGraphChartType] = useState<DashboardGraphType>("scatter");
  const [newGraphXKey, setNewGraphXKey] = useState<string>(PLAYER_COLUMNS[0].key);
  const [newGraphYKey, setNewGraphYKey] = useState<string>(PLAYER_COLUMNS[0].key);
  const [newGraphDataView, setNewGraphDataView] = useState<AnalysisMode>("lastSeason");
  const [newGraphShowReferenceLine, setNewGraphShowReferenceLine] = useState(false);
  const [newGraphDirection, setNewGraphDirection] = useState<TileDirection>("desc");
  const [newGraphCriteria, setNewGraphCriteria] = useState<GlobalScoutingFilters>(DEFAULT_FILTERS);
  const [newGraphPlayerMode, setNewGraphPlayerMode] = useState<"filters" | "players">("filters");
  const [newGraphPlayerIds, setNewGraphPlayerIds] = useState<number[]>([]);
  const [newGraphTeamMode, setNewGraphTeamMode] = useState<"all" | "selected">("all");
  const [newGraphTeamIds, setNewGraphTeamIds] = useState<number[]>([]);
  const [newGraphError, setNewGraphError] = useState<string | null>(null);
  // Same as editingTileId above, for the Add Graph dialog.
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null);

  // ---------- Saved Dashboard Views ----------
  //
  // A named set of the CURRENT scope's tiles, up to
  // MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE each for Player and Team — same
  // no-account, localStorage-only model as saved squads. "Default" (one per
  // scope) is permanent and immutable: no adding, removing, or reordering
  // its tiles — see selectedViewIsDefault below, used to gate every one of
  // those controls. Every other view is created blank via Create View,
  // which also selects it; from then on every tile change while it's
  // selected live-syncs into its storage (see the effect below), so there's
  // no separate Save step.
  const savedDashboardViews = useSavedDashboardViews();
  // Which saved view is picked per scope — persisted (see
  // useSavedDashboardViews' selectedViewIds), so whichever view a user was
  // last on for Player/Team tiles is still selected after a reload or
  // reopening the desktop app, not reset back to Default every time.
  const selectedViewId = savedDashboardViews.selectedViewIds[tileView];
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [createViewError, setCreateViewError] = useState<string | null>(null);
  const [loadViewError, setLoadViewError] = useState<string | null>(null);
  const [showDeleteViewConfirm, setShowDeleteViewConfirm] = useState(false);
  /** A tile or graph waiting for the person to confirm its removal (no undo). */
  const [confirmRemove, setConfirmRemove] = useState<{ kind: "tile" | "graph"; id: string; title: string } | null>(null);
  /** The Add/Save button was pressed with a problem: show it in the dialog until it's fixed (as Create View does). */
  const [tileSubmitTried, setTileSubmitTried] = useState(false);
  const [graphSubmitTried, setGraphSubmitTried] = useState(false);

  // The Starter view is the packaged FPL set plus, while a second source
  // is mounted, that source's own Starter items after it
  // (<source_starter_items>), so switching the source off takes them away.
  const visibleSavedViews = useMemo(
    () => savedDashboardViews.views.filter((v) => v.scope === tileView).map((v) => withSourceStarterItems(v, ext)),
    [savedDashboardViews.views, tileView, ext],
  );
  const selectedViewIsDefault = useMemo(() => isDefaultViewSelected(visibleSavedViews, selectedViewId), [visibleSavedViews, selectedViewId]);

  // Which view each scope's on-screen tiles and graphs were loaded from
  // (null until the scope is first shown). The tiles and graphs stores keep
  // their own working copy, which can differ from the selected view: when
  // the page first opens (a new install's working copy is the packaged set
  // while the view it opens on, My View, is blank), and whenever the
  // selection moves without a load, as when deleting the selected view
  // falls back to My View (audit 2026-10-18 C1). Loading the selected view
  // first, and holding the live-sync below until the on-screen copy is that
  // view's, stops one view's working copy being written into another.
  const [loadedViewIds, setLoadedViewIds] = useState<Record<SummaryTileScope, string | null>>({ player: null, team: null });

  // Keeps the currently-selected non-Default view's storage in lock-step
  // with whatever's actually on screen — every add/remove/reorder of a
  // tile OR a graph for this scope re-fires this (via tilesState.tiles or
  // graphsState.graphs changing) and writes straight through via
  // updateView(), which is itself a no-op if neither actually changed
  // (e.g. right after loading this same view). Never touches Default
  // (updateView refuses, and this skips the call entirely while Default is
  // selected).
  useEffect(() => {
    if (selectedViewIsDefault || !selectedViewId || loadedViewIds[tileView] !== selectedViewId) return;
    const scopeTiles = tilesState.tiles.filter((t) => t.scope === tileView);
    const scopeGraphs = graphsState.graphs.filter((g) => g.scope === tileView);
    savedDashboardViews.updateView(selectedViewId, scopeTiles, scopeGraphs);
  }, [tilesState.tiles, graphsState.graphs, tileView, selectedViewId, selectedViewIsDefault, loadedViewIds, savedDashboardViews.updateView]);

  // Whenever a scope's selected view isn't the one on screen (first shown,
  // or the selection moved without a load), put it on screen (see
  // loadedViewIds above). The packaged view is brought on screen by the
  // effect below instead.
  useEffect(() => {
    if (!selectedViewId || loadedViewIds[tileView] === selectedViewId) return;
    const view = visibleSavedViews.find((v) => v.id === selectedViewId);
    if (view && !selectedViewIsDefault) {
      tilesState.replaceScopeTiles(tileView, view.tiles);
      graphsState.replaceScopeGraphs(tileView, view.graphs);
    }
    setLoadedViewIds((prev) => ({ ...prev, [tileView]: selectedViewId }));
  }, [tileView, loadedViewIds, visibleSavedViews, selectedViewId, selectedViewIsDefault, tilesState.replaceScopeTiles, graphsState.replaceScopeGraphs]);

  // One-off reset (self-correcting, so it also guards against any future
  // regression, not just this one time) for anyone whose on-screen tiles or
  // graphs for a Default-selected scope had already drifted from the
  // packaged set — possible under the previous release, before Default
  // became immutable here, if they'd added/removed a tile while Default was
  // selected. The stored Default view itself is already always canonical
  // (see useSavedDashboardViews' migrate()); this brings whatever's actually
  // on screen back in sync with it whenever Default is selected and either
  // differs, rather than leaving a stale, already-editable-in-the-past set
  // on screen indefinitely. A no-op once reconciled, since nothing in the UI
  // can diverge them again afterward.
  useEffect(() => {
    if (!selectedViewIsDefault) return;
    const defaultView = visibleSavedViews.find((v) => v.id === selectedViewId);
    if (!defaultView) return;
    const currentScopeTiles = tilesState.tiles.filter((t) => t.scope === tileView);
    if (JSON.stringify(currentScopeTiles) !== JSON.stringify(defaultView.tiles)) {
      tilesState.replaceScopeTiles(tileView, defaultView.tiles);
    }
    const currentScopeGraphs = graphsState.graphs.filter((g) => g.scope === tileView);
    if (JSON.stringify(currentScopeGraphs) !== JSON.stringify(defaultView.graphs)) {
      graphsState.replaceScopeGraphs(tileView, defaultView.graphs);
    }
  }, [
    tileView,
    selectedViewIsDefault,
    selectedViewId,
    visibleSavedViews,
    tilesState.tiles,
    tilesState.replaceScopeTiles,
    graphsState.graphs,
    graphsState.replaceScopeGraphs,
  ]);

  function changeTileView(scope: SummaryTileScope) {
    setTileView(scope);
    setLoadViewError(null);
  }

  function openCreateViewModal() {
    setNewViewName("");
    setCreateViewError(null);
    setShowCreateViewModal(true);
  }

  function closeCreateViewModal() {
    setShowCreateViewModal(false);
  }

  /** Starts a brand-new, blank view (no tiles, no graphs) and switches to it — the only way to get an editable (non-Default) view onto screen. Tiles and graphs are then built up one at a time via their own in-grid Add cards, live-syncing into this view's storage as you go (see the effect above). */
  function handleCreateView() {
    const name = newViewName.trim();
    if (!name) {
      setCreateViewError("Enter a name for this view.");
      return;
    }
    if (visibleSavedViews.some((v) => v.name.trim().toLowerCase() === name.toLowerCase())) {
      setCreateViewError(`There's already a ${tileView} view called "${name}". Pick another name.`);
      return;
    }
    if (visibleSavedViews.length >= MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE) {
      setCreateViewError(`You already have ${MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE} ${tileView} views, Starter included, which is the maximum. Delete one first.`);
      return;
    }
    const id = savedDashboardViews.save(tileView, name, [], []);
    tilesState.replaceScopeTiles(tileView, []);
    graphsState.replaceScopeGraphs(tileView, []);
    savedDashboardViews.setSelectedViewId(tileView, id);
    setLoadedViewIds((prev) => ({ ...prev, [tileView]: id }));
    setShowCreateViewModal(false);
  }

  /** Returns whether the load actually happened — handleSelectView only moves the dropdown's selection on success, so a load blocked by either limit check below can never leave the selection pointing at a view whose tiles/graphs never actually made it on screen (which the live-sync effect above would otherwise immediately overwrite with the wrong content). */
  function handleLoadView(view: SavedDashboardView): boolean {
    const otherScopeTileCount = tilesState.tiles.filter((t) => t.scope !== tileView).length;
    if (otherScopeTileCount + view.tiles.length > MAX_SUMMARY_TILES) {
      setLoadViewError(`Loading "${view.name}" would push you past the ${MAX_SUMMARY_TILES}-tile limit (counted across Players and Teams). Remove some tiles first.`);
      return false;
    }
    const otherScopeGraphCount = graphsState.graphs.filter((g) => g.scope !== tileView).length;
    if (otherScopeGraphCount + view.graphs.length > MAX_DASHBOARD_GRAPHS) {
      setLoadViewError(`Loading "${view.name}" would push you past the ${MAX_DASHBOARD_GRAPHS}-graph limit (counted across Players and Teams). Remove a graph first.`);
      return false;
    }
    setLoadViewError(null);
    tilesState.replaceScopeTiles(tileView, view.tiles);
    graphsState.replaceScopeGraphs(tileView, view.graphs);
    return true;
  }

  function handleDeleteSelectedView() {
    setShowDeleteViewConfirm(false);
    if (!selectedViewId) return;
    // useSavedDashboardViews.remove() falls the scope's selection back to
    // My View (or Starter); the effect above then loads that view onto
    // screen before the live-sync can write anything into it.
    savedDashboardViews.remove(selectedViewId);
  }

  function handleSelectView(id: string) {
    const view = visibleSavedViews.find((v) => v.id === id);
    if (!view) return;
    if (handleLoadView(view)) {
      savedDashboardViews.setSelectedViewId(tileView, id);
      setLoadedViewIds((prev) => ({ ...prev, [tileView]: id }));
    }
  }

  // The rate-stat floor is for the packaged Default view only (audit
  // 2026-09-25 M1): decided by which view is on screen for Players, not by
  // a tile's id — a view saved before v1.35.0 can hold copies of the
  // Default's tiles, ids and all, that the user has since edited (R2).
  const playerDefaultViewShown = useMemo(
    () => isDefaultViewSelected(savedDashboardViews.views, savedDashboardViews.selectedViewIds.player),
    [savedDashboardViews.views, savedDashboardViews.selectedViewIds.player],
  );

  const usesExternal = tilesState.tiles.some(usesExternalMetric) || graphsState.graphs.some(usesExternalMetric);
  useEffect(() => {
    if (usesExternal) ext?.request();
  }, [ext, usesExternal]);
  // Which source each tile's or graph's ⇄ figures show, by item id — as an
  // Explorer column's toggle: FPL each visit, and back to FPL if the second
  // source goes away (<same_toggle_everywhere>).
  const [sourceChoice, setSourceChoice] = useState<ColumnSourceChoice>({});
  const toggleItemSource = useCallback(
    (id: string) => {
      if (!ext) return;
      ext.request();
      setSourceChoice((prev) => ({ ...prev, [id]: prev[id] === ext.id ? FPL_SOURCE : ext.id }));
    },
    [ext],
  );
  const switchedItem = (id: string) => ext !== null && sourceChoice[id] === ext.id;

  const tileRows = useMemo(() => {
    return tilesState.tiles
      .map((tile) => {
        if (tile.scope === "player") {
          const resolved = resolvePlayerTileMetric(tile.metricKey, tile.dataView, ext, switchedItem(tile.id));
          if (!resolved) return { tile, kind: "unavailable" as const, sourceOff: sourceOff(tile.metricKey, ext) };
          const { metric } = resolved;
          const floorOptions = { defaultViewShown: playerDefaultViewShown };
          const pool = resolvedByMode[tile.dataView];
          const sourcePlayers = playersForDashboardItem(tile, pool, floorOptions);
          const ranks = playerTileRanks(metric, pool, tile.dataView);
          const rows = sourcePlayers.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) }));
          const valueRows: TopListRow[] = rows.map((r) => ({ player: r.player, value: metric.getValue(r.player, r.derived), rank: ranks.get(r.player.id) }));
          // <hide_small_samples>: with the tile's Hide button on, players under the minutes threshold are left out and the next ones fill in.
          const hideSmallSamples = hiddenSmallSamples.hidden.has(tile.id);
          const candidates = hideSmallSamples ? valueRows.filter((r) => !isSmallSample(r.player.minutes, tile.dataView)) : valueRows;
          const topRows = topN(candidates, 5, tile.direction === "asc");
          const smallSampleCount = topRows.filter((r) => isSmallSample(r.player.minutes, tile.dataView)).length;
          const sourceControls = itemSourceControls(ext, [resolved], switchedItem(tile.id), () => toggleItemSource(tile.id));
          return { tile, metric, resolved, sourceControls, kind: "player" as const, topRows, floorNote: dashboardItemFloorNote(tile, floorOptions), hideSmallSamples, smallSampleCount };
        }
        const resolved = resolveTeamTileMetric(tile.metricKey, tile.dataView, ext, switchedItem(tile.id));
        if (!resolved) return { tile, kind: "unavailable" as const, sourceOff: sourceOff(tile.metricKey, ext) };
        const { metric } = resolved;
        let teamPool = teamAggregatesByMode[tile.dataView];
        const direction = colourDirection(metric);
        const ranks = direction === null ? new Map<number, number>() : clubRanks(teamPool, { id: (t) => t.teamId, value: metric.getValue, higherIsBetter: direction });
        if (tile.teamIds !== null) {
          const idSet = new Set(tile.teamIds);
          teamPool = teamPool.filter((t) => idSet.has(t.teamId));
        }
        const valueRows: TeamTopListRow[] = teamPool.map((t) => ({
          teamId: t.teamId,
          name: t.name,
          shortName: t.shortName,
          value: metric.getValue(t),
          rank: ranks.get(t.teamId),
        }));
        const sourceControls = itemSourceControls(ext, [resolved], switchedItem(tile.id), () => toggleItemSource(tile.id));
        return { tile, metric, resolved, sourceControls, kind: "team" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
      });
  }, [tilesState.tiles, resolvedByMode, teamAggregatesByMode, playerDefaultViewShown, hiddenSmallSamples.hidden, ext, sourceChoice, toggleItemSource]);

  // Split for rendering only — reordering still operates on the one
  // underlying `tilesState.tiles` array regardless of scope (drag-drop
  // is id-based, not index-based), this just picks out whichever scope
  // `tileView` currently has selected.
  const visibleTileRows = useMemo(() => tileRows.filter((t) => t.tile.scope === tileView), [tileRows, tileView]);

  // Same shape as tileRows above, one per saved graph — resolves each
  // graph's own scope/dataView/criteria (or specific player/team picks)
  // into chart-ready data, computed in one pass here rather than as
  // per-graph hooks (DashboardGraphCard is purely presentational), for the
  // same "variable number of hook calls" reason tiles already avoid it.
  const graphRows = useMemo(() => {
    return graphsState.graphs
      .map((graph) => {
        const graphSourceOff = sourceOff(graph.yMetricKey, ext) || (graph.chartType === "scatter" && sourceOff(graph.xMetricKey, ext));
        if (graph.scope === "player") {
          const switched = switchedItem(graph.id);
          const y = resolvePlayerGraphColumn(graph.yMetricKey, graph.dataView, ext, switched);
          const x = graph.chartType === "scatter" ? resolvePlayerGraphColumn(graph.xMetricKey, graph.dataView, ext, switched) : null;
          if (!y || (graph.chartType === "scatter" && !x)) return { graph, kind: "unavailable" as const, sourceOff: graphSourceOff };
          const yColumn = y.metric;
          const xColumn = x?.metric;
          const floorOptions = { defaultViewShown: playerDefaultViewShown };
          const sourcePlayers = playersForDashboardItem(graph, resolvedByMode[graph.dataView], floorOptions);
          const scatterData: ScatterPoint[] = [];
          const barData: BarDatum[] = [];
          // <hide_small_samples>: with the graph's Hide button on, players under the minutes threshold aren't plotted.
          const hideSmallSamples = hiddenSmallSamples.hidden.has(graph.id);
          const smallSampleIds = new Set<number>();
          for (const p of sourcePlayers) {
            // <minutes_marker>: a player under the floor is marked on the graph too (the amber stopwatch), as in every list.
            let smallSample: string | undefined;
            if (isSmallSample(p.minutes, graph.dataView)) {
              if (hideSmallSamples) continue;
              smallSampleIds.add(p.id);
              smallSample = smallSampleNote(p.minutes, graph.dataView);
            }
            const derived = getPlayerDerivedMetrics(p);
            const y = yColumn.getValue(p, derived);
            if (graph.chartType === "scatter") {
              const x = xColumn!.getValue(p, derived);
              if (x === null || y === null) continue;
              scatterData.push({ id: p.id, label: p.name, x, y, smallSample });
            } else {
              if (y === null) continue;
              barData.push({ id: p.id, label: p.name, value: y, smallSample });
            }
          }
          return {
            graph,
            kind: "player" as const,
            xLabel: x ? x.figure : "",
            yLabel: y.figure,
            xLabelClass: axisClass(x),
            yLabelClass: axisClass(y),
            format: y.format,
            xFormat: x?.format,
            sourceControls: itemSourceControls(ext, [x, y], switched, () => toggleItemSource(graph.id)),
            source: y.source ?? x?.source ?? null,
            metrics: x ? [x, y] : [y],
            scatterData,
            barData,
            floorNote: dashboardItemFloorNote(graph, floorOptions),
            hideSmallSamples,
            // The ones actually drawn: every scatter point, a bar chart's top 15.
            smallSampleCount: (graph.chartType === "scatter" ? scatterData : rankBars(barData, graph.direction === "asc")).filter((d) => smallSampleIds.has(d.id)).length,
          };
        }
        const switched = switchedItem(graph.id);
        const y = resolveTeamGraphColumn(graph.yMetricKey, graph.dataView, ext, switched);
        const x = graph.chartType === "scatter" ? resolveTeamGraphColumn(graph.xMetricKey, graph.dataView, ext, switched) : null;
        if (!y || (graph.chartType === "scatter" && !x)) return { graph, kind: "unavailable" as const, sourceOff: graphSourceOff };
        const yColumn = y.metric;
        const xColumn = x?.metric;
        let teamPool = teamAggregatesByMode[graph.dataView];
        if (graph.teamIds !== null) {
          const idSet = new Set(graph.teamIds);
          teamPool = teamPool.filter((t) => idSet.has(t.teamId));
        }
        const scatterData: ScatterPoint[] = [];
        const barData: BarDatum[] = [];
        for (const t of teamPool) {
          const y = yColumn.getValue(t);
          if (graph.chartType === "scatter") {
            const x = xColumn!.getValue(t);
            if (x === null || y === null) continue;
            scatterData.push({ id: t.teamId, label: t.name, x, y });
          } else {
            if (y === null) continue;
            barData.push({ id: t.teamId, label: t.name, value: y });
          }
        }
        return {
          graph,
          kind: "team" as const,
          xLabel: x ? x.figure : "",
          yLabel: y.figure,
          xLabelClass: axisClass(x),
          yLabelClass: axisClass(y),
          format: y.format,
          xFormat: x?.format,
          sourceControls: itemSourceControls(ext, [x, y], switched, () => toggleItemSource(graph.id)),
          source: y.source ?? x?.source ?? null,
          metrics: x ? [x, y] : [y],
          scatterData,
          barData,
          floorNote: null,
          hideSmallSamples: false,
          smallSampleCount: 0,
        };
      });
  }, [graphsState.graphs, resolvedByMode, teamAggregatesByMode, playerDefaultViewShown, hiddenSmallSamples.hidden, ext, sourceChoice, toggleItemSource]);

  const visibleGraphRows = useMemo(() => graphRows.filter((g) => g.graph.scope === tileView), [graphRows, tileView]);

  // Whether any current tile or graph needs the bulk historic dataset at
  // all — only "lastSeason"/"historicAverage" do (see
  // resolvePlayerStats.ts); a dashboard built entirely from Current Season
  // tiles/graphs never needs to wait on it.
  // Team figures come from club history in every mode, live included (it
  // arrives with the historic load), so any team tile/graph needs it too.
  const needsHistoric = (item: { dataView: AnalysisMode; scope: SummaryTileScope }) => item.dataView !== "live" || item.scope === "team";
  const usesHistoricData = tilesState.tiles.some(needsHistoric) || graphsState.graphs.some(needsHistoric);

  // Until the historic data a tile/graph needs has arrived, an empty result
  // means "not loaded", not "nobody qualifies" — say which.
  // Likewise while the second source an item's figures come from is loading, or couldn't be loaded.
  function emptyMessageFor(item: { dataView: AnalysisMode; scope: SummaryTileScope }, source: ExternalStatsSource | null = null): string | undefined {
    if (needsHistoric(item) && historicStatus !== "ready") return historicStatus === "error" ? "Historic data couldn't be loaded." : "Loading historic data…";
    return source ? externalLoadMessage(source) : undefined;
  }

  function openAddTileModal() {
    const firstMetric = tileView === "player" ? PLAYER_TILE_METRICS[0] : TEAM_TILE_METRICS[0];
    setNewTileMetricKey(firstMetric.key);
    setNewTileDirection(firstMetric.higherIsBetter ? "desc" : "asc");
    setNewTileDataView("lastSeason");
    setNewTileName("");
    setNewTileCriteria(DEFAULT_FILTERS);
    setNewTilePlayerMode("filters");
    setNewTilePlayerIds([]);
    setNewTileTeamMode("all");
    setNewTileTeamIds([]);
    setNewTileError(null);
    setTileSubmitTried(false);
    setEditingTileId(null);
    setShowAddTileModal(true);
  }

  /** Opens the same dialog prefilled with an existing tile's settings — saving replaces that tile in place (same position). */
  function openEditTileModal(tile: SummaryTileConfig) {
    setNewTileMetricKey(tile.metricKey);
    setNewTileDirection(tile.direction);
    setNewTileDataView(tile.dataView);
    setNewTileName(tile.name ?? "");
    setNewTileCriteria(tile.criteria ?? DEFAULT_FILTERS);
    setNewTilePlayerMode(tile.playerIds !== null ? "players" : "filters");
    setNewTilePlayerIds(tile.playerIds ?? []);
    setNewTileTeamMode(tile.teamIds !== null ? "selected" : "all");
    setNewTileTeamIds(tile.teamIds ?? []);
    setNewTileError(null);
    setTileSubmitTried(false);
    setEditingTileId(tile.id);
    setShowAddTileModal(true);
  }

  function closeAddTileModal() {
    setShowAddTileModal(false);
  }

  function handleMetricChange(key: string) {
    setNewTileMetricKey(key);
    const resolved = tileView === "player" ? resolvePlayerTileMetric(key, newTileDataView, ext) : resolveTeamTileMetric(key, newTileDataView, ext);
    if (resolved) setNewTileDirection(resolved.metric.higherIsBetter ? "desc" : "asc");
  }

  /** The dialogs' pickers' second-source groups (metricPickerGroups), or null with none mounted. Names don't change with the Data View. */
  function pickerGroups(scope: SummaryTileScope, mode: AnalysisMode): ExternalPickerGroups | null {
    if (!ext) return null;
    const set: ExternalColumnSet<{ key: string; label: string }> = scope === "player" ? ext.playerColumns(mode) : ext.teamColumns(mode);
    return { sourceId: ext.id, label: ext.label, icon: ext.icon, className: ext.className, crossover: new Set(Object.keys(set.alternates)), groups: set.groups };
  }

  /** A graph metric's natural Order (defaultGraphDirection), a second source's figure included. */
  function graphDirectionFor(scope: SummaryTileScope, key: string, mode: AnalysisMode): TileDirection {
    if (!parseExternalMetricKey(key)) return defaultGraphDirection(scope, key);
    const resolved = scope === "player" ? resolvePlayerGraphColumn(key, mode, ext) : resolveTeamGraphColumn(key, mode, ext);
    return resolved?.metric.higherIsBetter === false ? "asc" : "desc";
  }

  /** Switching away from "players" clears any in-progress player picks — picking up to 5 players is only meaningful within that mode, so it shouldn't silently carry over if the user goes back to Filters. */
  function togglePlayerTileMode(mode: "filters" | "players") {
    setNewTilePlayerMode(mode);
    if (mode === "filters") setNewTilePlayerIds([]);
  }

  function addNewTilePlayer(id: number) {
    setNewTilePlayerIds((prev) => (prev.length >= MAX_TILE_PLAYERS || prev.includes(id) ? prev : [...prev, id]));
  }

  function removeNewTilePlayer(id: number) {
    setNewTilePlayerIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleTeamTileMode(mode: "all" | "selected") {
    setNewTileTeamMode(mode);
    if (mode === "all") setNewTileTeamIds([]);
  }

  function addNewTileTeam(id: number) {
    setNewTileTeamIds((prev) => (prev.length >= MAX_TILE_TEAMS || prev.includes(id) ? prev : [...prev, id]));
  }

  function removeNewTileTeam(id: number) {
    setNewTileTeamIds((prev) => prev.filter((x) => x !== id));
  }

  // A name is optional: without one, a tile is titled by its statistic (displayTileTitle).
  const trimmedNewTileName = newTileName.trim();
  const newTilePlayersMissing = tileView === "player" && newTilePlayerMode === "players" && newTilePlayerIds.length === 0;
  const newTileTeamsMissing = tileView === "team" && newTileTeamMode === "selected" && newTileTeamIds.length === 0;
  const newTilePriceProblem = tileView === "player" && newTilePlayerMode === "filters" ? priceRangeProblem(newTileCriteria) : undefined;
  const addTileProblem = newTilePlayersMissing
    ? "Select at least one player to track."
    : newTileTeamsMissing
      ? "Select at least one team to track."
      : newTilePriceProblem && `${newTilePriceProblem}.`;

  // What an unnamed tile or graph is titled, shown as the Name box's placeholder.
  const metricLabelOf = (key: string, list: { key: string; label: string }[]) => list.find((m) => m.key === key)?.label ?? "Its statistic's name";
  const tileMetricList: { key: string; label: string; higherIsBetter: boolean }[] = tileView === "player" ? PLAYER_TILE_METRICS : TEAM_TILE_METRICS;
  const autoTileName = displayTileTitle(
    { name: null, direction: newTileDirection },
    metricLabelOf(newTileMetricKey, tileMetricList),
    tileMetricList.find((m) => m.key === newTileMetricKey)?.higherIsBetter ?? true,
  );
  const graphColumns = tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS;
  const autoGraphName =
    newGraphChartType === "scatter" ? `${metricLabelOf(newGraphXKey, graphColumns)} vs ${metricLabelOf(newGraphYKey, graphColumns)}` : metricLabelOf(newGraphYKey, graphColumns);

  function handleAddTile() {
    if (addTileProblem) {
      setTileSubmitTried(true);
      return;
    }
    const settings = {
      metricKey: newTileMetricKey,
      direction: newTileDirection,
      dataView: newTileDataView,
      name: trimmedNewTileName || null,
      criteria: tileView === "player" && newTilePlayerMode === "filters" ? newTileCriteria : null,
      playerIds: tileView === "player" && newTilePlayerMode === "players" ? newTilePlayerIds : null,
      teamIds: tileView === "team" && newTileTeamMode === "selected" ? newTileTeamIds : null,
    };
    if (editingTileId) {
      tilesState.updateTile(editingTileId, settings);
      setShowAddTileModal(false);
      return;
    }
    if (tilesState.tiles.length >= MAX_SUMMARY_TILES) {
      const here = tilesState.tiles.filter((t) => t.scope === tileView).length;
      const other = tilesState.tiles.length - here;
      setNewTileError(
        `You already have ${MAX_SUMMARY_TILES} tiles across Players and Teams (${here} here, ${other} in ${tileView === "player" ? "Teams" : "Players"}), which is the maximum. Remove one first.`,
      );
      return;
    }
    tilesState.addTile(createSummaryTile({ scope: tileView, ...settings }));
    setShowAddTileModal(false);
  }

  function handleTileDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleTileDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragOverTileId !== id) setDragOverTileId(id);
  }

  function handleTileDrop(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverTileId(null);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== id) tilesState.reorderTile(draggedId, id);
  }

  function openAddGraphModal() {
    const columns = tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS;
    setNewGraphName("");
    setNewGraphChartType("scatter");
    setNewGraphXKey(columns[0].key);
    setNewGraphYKey(columns.length > 1 ? columns[1].key : columns[0].key);
    setNewGraphDataView("lastSeason");
    setNewGraphShowReferenceLine(false);
    setNewGraphDirection(defaultGraphDirection(tileView, columns.length > 1 ? columns[1].key : columns[0].key));
    setNewGraphCriteria(DEFAULT_FILTERS);
    setNewGraphPlayerMode("filters");
    setNewGraphPlayerIds([]);
    setNewGraphTeamMode("all");
    setNewGraphTeamIds([]);
    setNewGraphError(null);
    setGraphSubmitTried(false);
    setEditingGraphId(null);
    setShowAddGraphModal(true);
  }

  /** Opens the same dialog prefilled with an existing graph's settings — saving replaces that graph in place (same position). */
  function openEditGraphModal(graph: DashboardGraphConfig) {
    setNewGraphName(graph.name ?? "");
    setNewGraphChartType(graph.chartType);
    setNewGraphXKey(graph.xMetricKey);
    setNewGraphYKey(graph.yMetricKey);
    setNewGraphDataView(graph.dataView);
    setNewGraphShowReferenceLine(graph.showReferenceLine);
    setNewGraphDirection(graph.direction);
    setNewGraphCriteria(graph.criteria ?? DEFAULT_FILTERS);
    setNewGraphPlayerMode(graph.playerIds !== null ? "players" : "filters");
    setNewGraphPlayerIds(graph.playerIds ?? []);
    setNewGraphTeamMode(graph.teamIds !== null ? "selected" : "all");
    setNewGraphTeamIds(graph.teamIds ?? []);
    setNewGraphError(null);
    setGraphSubmitTried(false);
    setEditingGraphId(graph.id);
    setShowAddGraphModal(true);
  }

  function closeAddGraphModal() {
    setShowAddGraphModal(false);
  }

  /** Same as handleMetricChange for tiles: a new metric starts in its natural order. */
  function handleGraphYMetricChange(key: string) {
    setNewGraphYKey(key);
    setNewGraphDirection(graphDirectionFor(tileView, key, newGraphDataView));
  }

  /** Switching away from "players" clears any in-progress player picks — same reasoning as togglePlayerTileMode above. */
  function togglePlayerGraphMode(mode: "filters" | "players") {
    setNewGraphPlayerMode(mode);
    if (mode === "filters") setNewGraphPlayerIds([]);
  }

  function addNewGraphPlayer(id: number) {
    setNewGraphPlayerIds((prev) => (prev.length >= MAX_TILE_PLAYERS || prev.includes(id) ? prev : [...prev, id]));
  }

  function removeNewGraphPlayer(id: number) {
    setNewGraphPlayerIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleTeamGraphMode(mode: "all" | "selected") {
    setNewGraphTeamMode(mode);
    if (mode === "all") setNewGraphTeamIds([]);
  }

  function addNewGraphTeam(id: number) {
    setNewGraphTeamIds((prev) => (prev.length >= MAX_TILE_TEAMS || prev.includes(id) ? prev : [...prev, id]));
  }

  function removeNewGraphTeam(id: number) {
    setNewGraphTeamIds((prev) => prev.filter((x) => x !== id));
  }

  // A name is optional: without one, a graph is titled by its statistics (displayGraphTitle).
  const trimmedNewGraphName = newGraphName.trim();
  const newGraphPlayersMissing = tileView === "player" && newGraphPlayerMode === "players" && newGraphPlayerIds.length === 0;
  const newGraphTeamsMissing = tileView === "team" && newGraphTeamMode === "selected" && newGraphTeamIds.length === 0;
  const newGraphPriceProblem = tileView === "player" && newGraphPlayerMode === "filters" ? priceRangeProblem(newGraphCriteria) : undefined;
  const addGraphProblem = newGraphPlayersMissing
    ? "Select at least one player to plot."
    : newGraphTeamsMissing
      ? "Select at least one team to plot."
      : newGraphPriceProblem && `${newGraphPriceProblem}.`;

  function handleAddGraph() {
    if (addGraphProblem) {
      setGraphSubmitTried(true);
      return;
    }
    const settings = {
      name: trimmedNewGraphName || null,
      chartType: newGraphChartType,
      xMetricKey: newGraphXKey,
      yMetricKey: newGraphYKey,
      dataView: newGraphDataView,
      direction: newGraphDirection,
      showReferenceLine: newGraphChartType === "scatter" && newGraphShowReferenceLine,
      criteria: tileView === "player" && newGraphPlayerMode === "filters" ? newGraphCriteria : null,
      playerIds: tileView === "player" && newGraphPlayerMode === "players" ? newGraphPlayerIds : null,
      teamIds: tileView === "team" && newGraphTeamMode === "selected" ? newGraphTeamIds : null,
    };
    if (editingGraphId) {
      graphsState.updateGraph(editingGraphId, settings);
      setShowAddGraphModal(false);
      return;
    }
    if (graphsState.graphs.length >= MAX_DASHBOARD_GRAPHS) {
      const here = graphsState.graphs.filter((g) => g.scope === tileView).length;
      const other = graphsState.graphs.length - here;
      setNewGraphError(
        `You already have ${MAX_DASHBOARD_GRAPHS} graphs across Players and Teams (${here} here, ${other} in ${tileView === "player" ? "Teams" : "Players"}), which is the maximum. Remove one first.`,
      );
      return;
    }
    graphsState.addGraph(createDashboardGraph({ scope: tileView, ...settings }));
    setShowAddGraphModal(false);
  }

  function handleGraphDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleGraphDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragOverGraphId !== id) setDragOverGraphId(id);
  }

  function handleGraphDrop(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverGraphId(null);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== id) graphsState.reorderGraph(draggedId, id);
  }

  function select(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  function selectTeam(teamId: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), teamProfile: String(teamId) }));
  }

  const gwDisplay = useMemo(() => gameweekDisplay(gameweekState, events), [gameweekState, events]);

  // Escape closes whichever dialog is open, discarding it like Cancel.
  const anyDialogOpen = showAddTileModal || showAddGraphModal || showCreateViewModal || showDeleteViewConfirm || confirmRemove !== null;
  useEscapeLayer(anyDialogOpen, () => {
    setShowAddTileModal(false);
    setShowAddGraphModal(false);
    setShowCreateViewModal(false);
    setShowDeleteViewConfirm(false);
    setConfirmRemove(null);
  });

  /** Removes the tile or graph the person just confirmed. */
  function handleConfirmRemove() {
    if (!confirmRemove) return;
    if (confirmRemove.kind === "tile") tilesState.removeTile(confirmRemove.id);
    else graphsState.removeGraph(confirmRemove.id);
    setConfirmRemove(null);
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1>Dashboard</h1>
          <div className="icon-toolbar">
            <button
              type="button"
              className={`chip chip-icon${tileView === "player" ? " active" : ""}`}
              title="Players: player leaderboards and graphs"
              aria-label="Players"
              aria-pressed={tileView === "player"}
              onClick={() => changeTileView("player")}
            >
              <PlayersViewIcon />
            </button>
            <button
              type="button"
              className={`chip chip-icon${tileView === "team" ? " active" : ""}`}
              title="Teams: club leaderboards and graphs"
              aria-label="Teams"
              aria-pressed={tileView === "team"}
              onClick={() => changeTileView("team")}
            >
              <TeamsViewIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="gw-strip">
        <span className="gw-strip-heading">{gwDisplay.heading}</span>
        <span className="gw-strip-sub">{gwDisplay.sub}</span>
        {gwDisplay.progress !== null && (
          <div className="gw-strip-track" title={`${gwDisplay.progress.toFixed(0)}% of the way to this deadline`}>
            <div className="gw-strip-fill" style={{ width: `${gwDisplay.progress}%` }} />
          </div>
        )}
      </div>

      {usesHistoricData && historicStatus === "loading" && (
        <div className="empty-state">
          <h3>Building the historic dataset…</h3>
          <p>This runs once per session and can take up to a minute; after that it's quick. Needed because at least one tile or graph uses Last Completed Season, Historic Average, or team figures.</p>
        </div>
      )}
      {usesHistoricData && historicStatus === "error" && (
        <p className="page-subtitle" style={{ color: "var(--accent-negative)" }}>
          Couldn't load historic data: {historicErrorMessage}
          <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
            {historicRefreshing ? "Retrying…" : "Retry"}
          </button>
        </p>
      )}
      {usesHistoricData && historicStatus === "ready" && historicSkippedPlayerIds.length > 0 && (
        <p className="page-subtitle">
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a fetch failed, or FPL sent data the app couldn't read). Everyone else
          is unaffected.
        </p>
      )}

      <SectionHeading icon="tiles">Summary Tiles</SectionHeading>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <select
          aria-label="Saved view"
          value={selectedViewId}
          onChange={(e) => handleSelectView(e.target.value)}
        >
          {visibleSavedViews.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button type="button" className="chip chip-icon" title="Create View" aria-label="Create View" onClick={openCreateViewModal}>
          <CreateViewIcon />
        </button>
        <button
          type="button"
          className="chip chip-icon"
          disabled={!selectedViewId || selectedViewIsDefault}
          title={selectedViewIsDefault ? "The Starter view can't be deleted" : "Delete View"}
          aria-label="Delete View"
          onClick={() => setShowDeleteViewConfirm(true)}
        >
          <TrashIcon />
        </button>
      </div>
      {loadViewError && (
        <div className="banner error" style={{ marginBottom: 12 }}>
          {loadViewError}
        </div>
      )}

      {visibleTileRows.length === 0 && selectedViewIsDefault ? (
        <p className="page-subtitle">No {tileView} tiles yet.</p>
      ) : (
        <div className="card-grid">
          {visibleTileRows.map((row) => {
            const { tile } = row;
            const onRemove = selectedViewIsDefault ? undefined : () => setConfirmRemove({ kind: "tile", id: tile.id, title: tile.name?.trim() || (row.kind === "unavailable" ? "this tile" : displayTileTitle(tile, row.metric.label, row.metric.higherIsBetter)) });
            if (row.kind === "unavailable") {
              return <UnavailableItemCard key={tile.id} title={tile.name?.trim() || "Unavailable tile"} noun="tile" onRemove={onRemove} sourceOff={row.sourceOff} />;
            }
            // Default is immutable (no reorder), so its tiles aren't draggable.
            const dragProps = {
              draggable: !selectedViewIsDefault,
              isDragOver: dragOverTileId === tile.id,
              onDragStart: (e: React.DragEvent) => handleTileDragStart(e, tile.id),
              onDragOver: (e: React.DragEvent) => handleTileDragOver(e, tile.id),
              onDragLeave: () => setDragOverTileId((k) => (k === tile.id ? null : k)),
              onDrop: (e: React.DragEvent) => handleTileDrop(e, tile.id),
            };
            const common = {
              title: displayTileTitle(tile, row.metric.label, row.metric.higherIsBetter),
              // As the tile's Data View shows it (<averaged_counts>), the same as the tables.
              format: row.resolved.format,
              dataView: tile.dataView,
              emptyMessage: emptyMessageFor(tile, row.resolved.source),
              sourceControls: row.sourceControls,
              source: cardSource([row.resolved]),
              onEdit: selectedViewIsDefault ? undefined : () => openEditTileModal(tile),
              onRemove,
              ...dragProps,
            };
            return row.kind === "player" ? (
              <TopList
                key={tile.id}
                {...common}
                rows={row.topRows as TopListRow[]}
                onSelect={select}
                signed={row.metric.signed}
                floorNote={row.floorNote}
                smallSamples={{ hidden: row.hideSmallSamples, count: row.smallSampleCount, onToggle: () => hiddenSmallSamples.toggle(tile.id) }}
              />
            ) : (
              <TeamTopList key={tile.id} {...common} rows={row.topRows as TeamTopListRow[]} onSelect={selectTeam} />
            );
          })}
          {!selectedViewIsDefault && (
            <button type="button" className="add-tile-card" onClick={openAddTileModal} title="Add Tile" aria-label="Add Tile">
              <PlusIcon size={22} />
            </button>
          )}
        </div>
      )}

      <SectionHeading icon="graphs">Graphs</SectionHeading>

      {visibleGraphRows.length === 0 && selectedViewIsDefault ? (
        <p className="page-subtitle">No {tileView} graphs yet.</p>
      ) : (
        <div className="card-grid graph-grid">
          {visibleGraphRows.map((row) => {
            const { graph } = row;
            if (row.kind === "unavailable") {
              return (
                <UnavailableItemCard
                  key={graph.id}
                  title={graph.name?.trim() || "Unavailable graph"}
                  noun="graph"
                  minHeight={360}
                  onRemove={selectedViewIsDefault ? undefined : () => setConfirmRemove({ kind: "graph", id: graph.id, title: graph.name?.trim() || "this graph" })}
                  sourceOff={row.sourceOff}
                />
              );
            }
            const { kind, xLabel, yLabel, xLabelClass, yLabelClass, format, xFormat, scatterData, barData } = row;
            return (
            <DashboardGraphCard
              key={graph.id}
              title={displayGraphTitle(graph, xLabel, yLabel)}
              kind={kind}
              chartType={graph.chartType}
              scatterData={scatterData}
              barData={barData}
              xLabel={xLabel}
              yLabel={yLabel}
              xLabelClass={xLabelClass}
              yLabelClass={yLabelClass}
              format={format}
              xFormat={xFormat}
              ascending={graph.direction === "asc"}
              emptyMessage={emptyMessageFor(graph, row.source)}
              sourceControls={row.sourceControls}
              source={cardSource(row.metrics)}
              showReferenceLine={graph.showReferenceLine}
              dataView={graph.dataView}
              floorNote={row.floorNote}
              smallSamples={kind === "player" ? { hidden: row.hideSmallSamples, count: row.smallSampleCount, onToggle: () => hiddenSmallSamples.toggle(graph.id) } : undefined}
              onSelect={kind === "player" ? select : selectTeam}
              draggable={!selectedViewIsDefault}
              isDragOver={dragOverGraphId === graph.id}
              onDragStart={(e) => handleGraphDragStart(e, graph.id)}
              onDragOver={(e) => handleGraphDragOver(e, graph.id)}
              onDragLeave={() => setDragOverGraphId((k) => (k === graph.id ? null : k))}
              onDrop={(e) => handleGraphDrop(e, graph.id)}
              onEdit={selectedViewIsDefault ? undefined : () => openEditGraphModal(graph)}
              onRemove={selectedViewIsDefault ? undefined : () => setConfirmRemove({ kind: "graph", id: graph.id, title: displayGraphTitle(graph, xLabel, yLabel) })}
            />
            );
          })}
          {!selectedViewIsDefault && (
            <button
              type="button"
              className="add-tile-card"
              style={{ minHeight: 360 }}
              onClick={openAddGraphModal}
              title="Add Graph"
              aria-label="Add Graph"
            >
              <PlusIcon size={22} />
            </button>
          )}
        </div>
      )}

      {showAddTileModal && (
        <div className="dialog-backdrop" onClick={closeAddTileModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {editingTileId ? "Edit" : "Add"} {tileView === "player" ? "Player" : "Team"} Tile
            </div>
            <div className="field">
              <label htmlFor="new-tile-name">Name</label>
              <input
                id="new-tile-name"
                type="text"
                maxLength={MAX_NAME_LENGTH}
                placeholder={autoTileName}
                value={newTileName}
                onChange={(e) => setNewTileName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-tile-metric">Statistic</label>
              <GroupedPicker
                id="new-tile-metric"
                value={newTileMetricKey}
                onChange={handleMetricChange}
                groups={metricPickerGroups(tileView === "player" ? PLAYER_TILE_METRICS : TEAM_TILE_METRICS, pickerGroups(tileView, newTileDataView))}
              />
            </div>
            <SegmentedControl label="Data View" options={DATA_VIEW_SEGMENTS} value={newTileDataView} onChange={setNewTileDataView} />
            <SegmentedControl label="Order" options={ORDER_SEGMENTS} value={newTileDirection} onChange={setNewTileDirection} />
            {tileView === "player" && (
              <>
                <SegmentedControl
                  label="Players"
                  options={[
                    { value: "filters", title: "Filters: narrow by position, team and minutes", icon: <FilterIcon /> },
                    { value: "players", title: "Player Search: track up to 5 specific players", icon: <PlayerSearchIcon /> },
                  ]}
                  value={newTilePlayerMode}
                  onChange={togglePlayerTileMode}
                />
                {newTilePlayerMode === "filters" ? (
                  <FiltersBar
                    idPrefix="new-tile-criteria"
                    filters={newTileCriteria}
                    onChange={setNewTileCriteria}
                    onReset={() => setNewTileCriteria(DEFAULT_FILTERS)}
                    showSearch={false}
                    showPrice
                    inDialog
                  />
                ) : (
                  <>
                    {newTilePlayerIds.length > 0 && (
                      <div className="chip-row">
                        {newTilePlayerIds.map((id) => {
                          const p = players.find((pl) => pl.id === id);
                          if (!p) return null;
                          return (
                            <span key={id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
                              {p.name}
                              <button
                                type="button"
                                onClick={() => removeNewTilePlayer(id)}
                                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                                title="Remove"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <PlayerSearch
                      excludeIds={newTilePlayerIds}
                      onPick={addNewTilePlayer}
                      disabled={newTilePlayerIds.length >= MAX_TILE_PLAYERS}
                      label={`Search players (${newTilePlayerIds.length}/${MAX_TILE_PLAYERS})`}
                      disabledLabel={`Search players (${MAX_TILE_PLAYERS}/${MAX_TILE_PLAYERS})`}
                    />
                  </>
                )}
              </>
            )}
            {tileView === "team" && (
              <>
                <SegmentedControl
                  label="Teams"
                  options={[
                    { value: "all", title: "All Teams: rank every team", icon: <AllTeamsIcon /> },
                    { value: "selected", title: "Team Selection: track up to 5 specific teams", icon: <TeamSelectionIcon /> },
                  ]}
                  value={newTileTeamMode}
                  onChange={toggleTeamTileMode}
                />
                {newTileTeamMode === "selected" && (
                  <>
                    {newTileTeamIds.length > 0 && (
                      <div className="chip-row">
                        {newTileTeamIds.map((id) => {
                          const t = teams.find((tm) => tm.id === id);
                          if (!t) return null;
                          return (
                            <span key={id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
                              {t.name}
                              <button
                                type="button"
                                onClick={() => removeNewTileTeam(id)}
                                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                                title="Remove"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <TeamPicker
                      teams={teams}
                      excludeIds={newTileTeamIds}
                      onPick={addNewTileTeam}
                      disabled={newTileTeamIds.length >= MAX_TILE_TEAMS}
                      label={`Search teams (${newTileTeamIds.length}/${MAX_TILE_TEAMS})`}
                      disabledLabel={`Search teams (${MAX_TILE_TEAMS}/${MAX_TILE_TEAMS})`}
                    />
                  </>
                )}
              </>
            )}
            {tileSubmitTried && addTileProblem ? <div className="banner error">{addTileProblem}</div> : newTileError && <div className="banner error">{newTileError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeAddTileModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAddTile}>
                {editingTileId ? "Save Changes" : "Add Tile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddGraphModal && (
        <div className="dialog-backdrop" onClick={closeAddGraphModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {editingGraphId ? "Edit" : "Add"} {tileView === "player" ? "Player" : "Team"} Graph
            </div>
            <div className="field">
              <label htmlFor="new-graph-name">Name</label>
              <input
                id="new-graph-name"
                type="text"
                maxLength={MAX_NAME_LENGTH}
                placeholder={autoGraphName}
                value={newGraphName}
                onChange={(e) => setNewGraphName(e.target.value)}
              />
            </div>
            <SegmentedControl label="Graph Type" options={GRAPH_TYPE_SEGMENTS} value={newGraphChartType} onChange={setNewGraphChartType} />
            {newGraphChartType === "scatter" && (
              <div className="field">
                <label htmlFor="new-graph-x">X axis metric</label>
                <GroupedPicker
                  id="new-graph-x"
                  value={newGraphXKey}
                  onChange={setNewGraphXKey}
                  groups={metricPickerGroups(tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS, pickerGroups(tileView, newGraphDataView))}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="new-graph-y">{newGraphChartType === "scatter" ? "Y axis metric" : "Metric"}</label>
              <GroupedPicker
                id="new-graph-y"
                value={newGraphYKey}
                onChange={handleGraphYMetricChange}
                groups={metricPickerGroups(tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS, pickerGroups(tileView, newGraphDataView))}
              />
            </div>
            <SegmentedControl label="Data View" options={DATA_VIEW_SEGMENTS} value={newGraphDataView} onChange={setNewGraphDataView} />
            {newGraphChartType === "bar" && (
              <SegmentedControl label="Order" options={ORDER_SEGMENTS} value={newGraphDirection} onChange={setNewGraphDirection} />
            )}
            {newGraphChartType === "scatter" && (
              <div className="field">
                <span className="field-label">Trend Line</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip chip-icon${newGraphShowReferenceLine ? " active" : ""}`}
                    title="Add Trend Line"
                    aria-label="Add Trend Line"
                    aria-pressed={newGraphShowReferenceLine}
                    onClick={() => setNewGraphShowReferenceLine((on) => !on)}
                  >
                    <TrendLineIcon />
                  </button>
                </div>
              </div>
            )}
            {tileView === "player" && (
              <>
                <SegmentedControl
                  label="Players"
                  options={[
                    { value: "filters", title: "Filters: narrow by position, team and minutes", icon: <FilterIcon /> },
                    { value: "players", title: "Player Search: plot up to 5 specific players", icon: <PlayerSearchIcon /> },
                  ]}
                  value={newGraphPlayerMode}
                  onChange={togglePlayerGraphMode}
                />
                {newGraphPlayerMode === "filters" ? (
                  <FiltersBar
                    idPrefix="new-graph-criteria"
                    filters={newGraphCriteria}
                    onChange={setNewGraphCriteria}
                    onReset={() => setNewGraphCriteria(DEFAULT_FILTERS)}
                    showSearch={false}
                    showPrice
                    inDialog
                  />
                ) : (
                  <>
                    {newGraphPlayerIds.length > 0 && (
                      <div className="chip-row">
                        {newGraphPlayerIds.map((id) => {
                          const p = players.find((pl) => pl.id === id);
                          if (!p) return null;
                          return (
                            <span key={id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
                              {p.name}
                              <button
                                type="button"
                                onClick={() => removeNewGraphPlayer(id)}
                                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                                title="Remove"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <PlayerSearch
                      excludeIds={newGraphPlayerIds}
                      onPick={addNewGraphPlayer}
                      disabled={newGraphPlayerIds.length >= MAX_TILE_PLAYERS}
                      label={`Search players (${newGraphPlayerIds.length}/${MAX_TILE_PLAYERS})`}
                      disabledLabel={`Search players (${MAX_TILE_PLAYERS}/${MAX_TILE_PLAYERS})`}
                    />
                  </>
                )}
              </>
            )}
            {tileView === "team" && (
              <>
                <SegmentedControl
                  label="Teams"
                  options={[
                    { value: "all", title: "All Teams: plot every team", icon: <AllTeamsIcon /> },
                    { value: "selected", title: "Team Selection: plot up to 5 specific teams", icon: <TeamSelectionIcon /> },
                  ]}
                  value={newGraphTeamMode}
                  onChange={toggleTeamGraphMode}
                />
                {newGraphTeamMode === "selected" && (
                  <>
                    {newGraphTeamIds.length > 0 && (
                      <div className="chip-row">
                        {newGraphTeamIds.map((id) => {
                          const t = teams.find((tm) => tm.id === id);
                          if (!t) return null;
                          return (
                            <span key={id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
                              {t.name}
                              <button
                                type="button"
                                onClick={() => removeNewGraphTeam(id)}
                                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                                title="Remove"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <TeamPicker
                      teams={teams}
                      excludeIds={newGraphTeamIds}
                      onPick={addNewGraphTeam}
                      disabled={newGraphTeamIds.length >= MAX_TILE_TEAMS}
                      label={`Search teams (${newGraphTeamIds.length}/${MAX_TILE_TEAMS})`}
                      disabledLabel={`Search teams (${MAX_TILE_TEAMS}/${MAX_TILE_TEAMS})`}
                    />
                  </>
                )}
              </>
            )}
            {graphSubmitTried && addGraphProblem ? <div className="banner error">{addGraphProblem}</div> : newGraphError && <div className="banner error">{newGraphError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeAddGraphModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAddGraph}>
                {editingGraphId ? "Save Changes" : "Add Graph"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="dialog-backdrop" onClick={() => setConfirmRemove(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Remove {confirmRemove.kind}</div>
            <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
              Remove "{confirmRemove.title}" from this view? This can't be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleConfirmRemove}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteViewConfirm && (
        <div className="dialog-backdrop" onClick={() => setShowDeleteViewConfirm(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Delete view</div>
            <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
              Delete "{visibleSavedViews.find((v) => v.id === selectedViewId)?.name ?? "this view"}" and all its tiles and graphs? This can't be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setShowDeleteViewConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleDeleteSelectedView}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateViewModal && (
        <div className="dialog-backdrop" onClick={closeCreateViewModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Create {tileView === "player" ? "Player" : "Team"} View</div>
            <div className="field">
              <label htmlFor="new-view-name">Name</label>
              <input
                id="new-view-name"
                type="text"
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Attacking Threats"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateView();
                }}
              />
            </div>
            {createViewError && <div className="banner error">{createViewError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeCreateViewModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleCreateView}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
