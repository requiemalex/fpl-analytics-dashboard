import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { filterPlayers } from "../state/useFilteredPlayers";
import { computeTeamAggregates, type TeamAggregate } from "../metrics/teamStats";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { ANALYSIS_MODE_OPTIONS } from "../components/AnalysisModeToggle";
import { FiltersBar } from "../components/FiltersBar";
import { CardEditRemoveButtons, FilterIcon, TrashIcon, TrendLineIcon } from "../components/IconToolbar";
import { PlayerSearch } from "../components/PlayerSearch";
import { TeamPicker } from "../components/TeamPicker";
import { TopList, type TopListRow } from "../components/TopList";
import { TeamTopList, type TeamTopListRow } from "../components/TeamTopList";
import { DashboardGraphCard } from "../components/DashboardGraphCard";
import type { ScatterPoint } from "../components/charts/ScatterWithReference";
import type { BarDatum } from "../components/charts/BarTopN";
import { PLAYER_COLUMNS, columnByKey as playerColumnByKey } from "../components/playerColumns";
import { TEAM_COLUMNS, teamColumnByKey } from "../components/teamColumns";
import {
  PLAYER_TILE_METRICS,
  TEAM_TILE_METRICS,
  playerTileMetricByKey,
  teamTileMetricByKey,
  isRatePerMinutesColumnKey,
  type SummaryTileScope,
} from "../components/summaryTileMetrics";
import { useSummaryTiles, createSummaryTile, MAX_SUMMARY_TILES, type TileDirection, type SummaryTileConfig } from "../state/useSummaryTiles";
import {
  useDashboardGraphs,
  createDashboardGraph,
  defaultGraphDirection,
  MAX_DASHBOARD_GRAPHS,
  type DashboardGraphType,
  type DashboardGraphConfig,
} from "../state/useDashboardGraphs";
import { useSavedDashboardViews, isDefaultSavedView, MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE, type SavedDashboardView } from "../state/useSavedDashboardViews";
import { fmtDate, fmtTimeAgo } from "../utils/format";
import type { NormalizedPlayer } from "../types/normalized";

/** Same cap for both, and reused for graphs too (see MAX_TILE_PLAYERS/MAX_TILE_TEAMS usage below) — a tile or graph tracking a handful of specific players/teams is meant for close comparison, not a second way to build a big list. */
const MAX_TILE_PLAYERS = 5;
const MAX_TILE_TEAMS = 5;

/** Every mode a tile can be built from — used to pre-compute one resolved/eligible/aggregate bucket per mode (see below), since tiles now each carry their own data view rather than sharing one page-wide mode. */
const MODES: AnalysisMode[] = ["live", "lastSeason", "historicAverage"];

// A rate-per-game metric (PPG, xG/Game, xGC/Game, DC/Game, Goals/Game, etc.
// — see PlayerTileMetric.ratePerMinutes / isRatePerMinutesColumnKey) still
// needs a real sample to mean anything, even with the estimated-games basis
// (see <per_game_not_per_90> in metrics/calculations.ts). Current Season gets
// its own, much lower floor (one full match) rather than being exempted
// entirely, since everyone genuinely has low minutes for only the first
// couple of gameweeks. Applied per tile/graph, on top of its own criteria
// filter — never to specifically picked players.
export const LIVE_RATE_STAT_MIN_MINUTES = 90;
export const RATE_STAT_MIN_MINUTES = 450;

export function applyRateStatFloor(players: NormalizedPlayer[], dataView: AnalysisMode): NormalizedPlayer[] {
  const floor = dataView === "live" ? LIVE_RATE_STAT_MIN_MINUTES : RATE_STAT_MIN_MINUTES;
  return players.filter((p) => p.minutes !== null && p.minutes >= floor);
}

export function topN<T extends { value: number | null }>(rowsIn: T[], n: number, ascending = false): T[] {
  const eligible = rowsIn.filter((r) => r.value !== null) as (T & { value: number })[];
  eligible.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  return eligible.slice(0, n);
}

function tileTitle(metricLabel: string, direction: TileDirection): string {
  return `${direction === "desc" ? "Top" : "Bottom"} 5 — ${metricLabel}`;
}

/** A tile's custom name (set in the Add/Edit dialog) if it has one, else the auto-generated "Top/Bottom 5 — <metric>" title. */
function displayTileTitle(tile: SummaryTileConfig, metricLabel: string): string {
  return tile.name && tile.name.trim() ? tile.name : tileTitle(metricLabel, tile.direction);
}

/** A bar graph in its metric's natural order is its "Top 15" (League Position 1–15, lowest Goals Against…); the other way round is its "Bottom 15". */
function graphTitle(graph: DashboardGraphConfig, xLabel: string, yLabel: string): string {
  if (graph.chartType === "scatter") return `${xLabel} vs ${yLabel}`;
  const natural = graph.direction === defaultGraphDirection(graph.scope, graph.yMetricKey);
  return `${natural ? "Top" : "Bottom"} 15 — ${yLabel}`;
}

/** A graph's custom name (set in the Add/Edit dialog) if it has one, else the auto-generated "<X> vs <Y>" / "Top 15 — <Y>" title. */
function displayGraphTitle(graph: DashboardGraphConfig, xLabel: string, yLabel: string): string {
  return graph.name && graph.name.trim() ? graph.name : graphTitle(graph, xLabel, yLabel);
}

/** Longest custom name a tile, graph or view takes — past this it's no longer a title. */
const MAX_NAME_LENGTH = 60;

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
      if (!next) return { heading: current.name, sub: "Finished — awaiting next gameweek", progress: null };
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

/** Stand-in for a saved tile or graph whose statistic this version doesn't have (e.g. one removed in an update) — says so and can still be removed, rather than vanishing while still counting toward the cap. */
function UnavailableItemCard({ title, noun, onRemove, minHeight }: { title: string; noun: "tile" | "graph"; onRemove?: () => void; minHeight?: number }) {
  return (
    <div className="card" style={minHeight ? { minHeight } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="card-title">{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <CardEditRemoveButtons noun={noun} onRemove={onRemove} />
        </div>
      </div>
      <p className="page-subtitle" style={{ margin: 0 }}>
        This {noun}'s statistic is no longer available.
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

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-card-icon">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-card-icon">
      <circle cx="6" cy="5.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.6 14c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.6" cy="6.2" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.3 9.3c1.9-.2 3.7.9 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Header view toggle — same two-person mark as UsersIcon above (the "Players Tracked" summary tile), just without that component's summary-card-icon styling (margin/colour meant for a card corner, not a button). */
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

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-card-icon">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.6 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A view (window) with a "+" badge — Create View, distinct from the bare "+" used for adding a single tile. */
function CreateViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.3" y="2.3" width="10.4" height="8.4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.3" y1="4.7" x2="11.7" y2="4.7" stroke="currentColor" strokeWidth="1" />
      <circle cx="11.6" cy="11.6" r="3.2" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.2" />
      <line x1="11.6" y1="10.1" x2="11.6" y2="13.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="10.1" y1="11.6" x2="13.1" y2="11.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
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
    lastUpdated,
    historicProfiles,
    historicStatus,
    historicErrorMessage,
    historicSkippedPlayerIds,
    refreshHistoricData,
    historicRefreshing,
    currentSeasonHasStarted,
    requestHistoricData,
    clubSeasons,
    historicReferenceSeason,
  } = useAppState();
  const [, setSearchParams] = useSearchParams();

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
    const ctx = { clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted };
    const map = {} as Record<AnalysisMode, TeamAggregate[]>;
    for (const mode of MODES) map[mode] = computeTeamAggregates(teams, mode, ctx);
    return map;
  }, [teams, clubSeasons, historicReferenceSeason, currentSeasonHasStarted]);

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

  const visibleSavedViews = useMemo(
    () => savedDashboardViews.views.filter((v) => v.scope === tileView),
    [savedDashboardViews.views, tileView],
  );
  const selectedViewIsDefault = useMemo(() => {
    const view = visibleSavedViews.find((v) => v.id === selectedViewId);
    return view ? isDefaultSavedView(view) : false;
  }, [visibleSavedViews, selectedViewId]);

  // Keeps the currently-selected non-Default view's storage in lock-step
  // with whatever's actually on screen — every add/remove/reorder of a
  // tile OR a graph for this scope re-fires this (via tilesState.tiles or
  // graphsState.graphs changing) and writes straight through via
  // updateView(), which is itself a no-op if neither actually changed
  // (e.g. right after loading this same view). Never touches Default
  // (updateView refuses, and this skips the call entirely while Default is
  // selected).
  useEffect(() => {
    if (selectedViewIsDefault || !selectedViewId) return;
    const scopeTiles = tilesState.tiles.filter((t) => t.scope === tileView);
    const scopeGraphs = graphsState.graphs.filter((g) => g.scope === tileView);
    savedDashboardViews.updateView(selectedViewId, scopeTiles, scopeGraphs);
  }, [tilesState.tiles, graphsState.graphs, tileView, selectedViewId, selectedViewIsDefault, savedDashboardViews.updateView]);

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
      setCreateViewError(`You already have ${MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE} ${tileView} views, Default included — the maximum allowed. Delete one first.`);
      return;
    }
    const id = savedDashboardViews.save(tileView, name, [], []);
    tilesState.replaceScopeTiles(tileView, []);
    graphsState.replaceScopeGraphs(tileView, []);
    savedDashboardViews.setSelectedViewId(tileView, id);
    setShowCreateViewModal(false);
  }

  /** Returns whether the load actually happened — handleSelectView only moves the dropdown's selection on success, so a load blocked by either limit check below can never leave the selection pointing at a view whose tiles/graphs never actually made it on screen (which the live-sync effect above would otherwise immediately overwrite with the wrong content). */
  function handleLoadView(view: SavedDashboardView): boolean {
    const otherScopeTileCount = tilesState.tiles.filter((t) => t.scope !== tileView).length;
    if (otherScopeTileCount + view.tiles.length > MAX_SUMMARY_TILES) {
      setLoadViewError(`Loading "${view.name}" would push you past the ${MAX_SUMMARY_TILES}-tile limit (counted across Players and Teams) — remove some tiles first.`);
      return false;
    }
    const otherScopeGraphCount = graphsState.graphs.filter((g) => g.scope !== tileView).length;
    if (otherScopeGraphCount + view.graphs.length > MAX_DASHBOARD_GRAPHS) {
      setLoadViewError(`Loading "${view.name}" would push you past the ${MAX_DASHBOARD_GRAPHS}-graph limit (counted across Players and Teams) — remove a graph first.`);
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
    // useSavedDashboardViews.remove() already falls the scope's selection
    // back to Default when the deleted view was the one selected.
    savedDashboardViews.remove(selectedViewId);
  }

  function handleSelectView(id: string) {
    const view = visibleSavedViews.find((v) => v.id === id);
    if (!view) return;
    if (handleLoadView(view)) {
      savedDashboardViews.setSelectedViewId(tileView, id);
    }
  }

  const tileRows = useMemo(() => {
    return tilesState.tiles
      .map((tile) => {
        if (tile.scope === "player") {
          const metric = playerTileMetricByKey(tile.metricKey);
          if (!metric) return { tile, kind: "unavailable" as const };
          let sourcePlayers: NormalizedPlayer[];
          if (tile.playerIds && tile.playerIds.length > 0) {
            // Tracking specific players — sort/rank exactly those (up to
            // MAX_TILE_PLAYERS), skipping the criteria filter and the
            // rate-stat minutes floor entirely, since the user explicitly
            // picked these players by name rather than by a threshold.
            const idSet = new Set(tile.playerIds);
            sourcePlayers = resolvedByMode[tile.dataView].filter((p) => idSet.has(p.id));
          } else {
            const criteria = tile.criteria ?? DEFAULT_FILTERS;
            sourcePlayers = filterPlayers(resolvedByMode[tile.dataView], criteria, tile.dataView, true);
            if (metric.ratePerMinutes) sourcePlayers = applyRateStatFloor(sourcePlayers, tile.dataView);
          }
          const rows = sourcePlayers.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) }));
          const valueRows: TopListRow[] = rows.map((r) => ({ player: r.player, value: metric.getValue(r.player, r.derived) }));
          return { tile, metric, kind: "player" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
        }
        const metric = teamTileMetricByKey(tile.metricKey);
        if (!metric) return { tile, kind: "unavailable" as const };
        let teamPool = teamAggregatesByMode[tile.dataView];
        if (tile.teamIds && tile.teamIds.length > 0) {
          const idSet = new Set(tile.teamIds);
          teamPool = teamPool.filter((t) => idSet.has(t.teamId));
        }
        const valueRows: TeamTopListRow[] = teamPool.map((t) => ({
          teamId: t.teamId,
          name: t.name,
          shortName: t.shortName,
          value: metric.getValue(t),
        }));
        return { tile, metric, kind: "team" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
      });
  }, [tilesState.tiles, resolvedByMode, teamAggregatesByMode]);

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
        if (graph.scope === "player") {
          const yColumn = playerColumnByKey(graph.yMetricKey);
          const xColumn = graph.chartType === "scatter" ? playerColumnByKey(graph.xMetricKey) : undefined;
          if (!yColumn || (graph.chartType === "scatter" && !xColumn)) return { graph, kind: "unavailable" as const };
          let sourcePlayers: NormalizedPlayer[];
          if (graph.playerIds && graph.playerIds.length > 0) {
            const idSet = new Set(graph.playerIds);
            sourcePlayers = resolvedByMode[graph.dataView].filter((p) => idSet.has(p.id));
          } else {
            const criteria = graph.criteria ?? DEFAULT_FILTERS;
            sourcePlayers = filterPlayers(resolvedByMode[graph.dataView], criteria, graph.dataView, true);
            const plotsRate = isRatePerMinutesColumnKey(graph.yMetricKey) || (graph.chartType === "scatter" && isRatePerMinutesColumnKey(graph.xMetricKey));
            if (plotsRate) sourcePlayers = applyRateStatFloor(sourcePlayers, graph.dataView);
          }
          const scatterData: ScatterPoint[] = [];
          const barData: BarDatum[] = [];
          for (const p of sourcePlayers) {
            const derived = getPlayerDerivedMetrics(p);
            const y = yColumn.getValue(p, derived);
            if (graph.chartType === "scatter") {
              const x = xColumn!.getValue(p, derived);
              if (x === null || y === null) continue;
              scatterData.push({ id: p.id, label: p.name, x, y });
            } else {
              if (y === null) continue;
              barData.push({ id: p.id, label: p.name, value: y });
            }
          }
          return {
            graph,
            kind: "player" as const,
            xLabel: xColumn?.label ?? "",
            yLabel: yColumn.label,
            format: yColumn.format,
            xFormat: xColumn?.format,
            scatterData,
            barData,
          };
        }
        const yColumn = teamColumnByKey(graph.yMetricKey);
        const xColumn = graph.chartType === "scatter" ? teamColumnByKey(graph.xMetricKey) : undefined;
        if (!yColumn || (graph.chartType === "scatter" && !xColumn)) return { graph, kind: "unavailable" as const };
        let teamPool = teamAggregatesByMode[graph.dataView];
        if (graph.teamIds && graph.teamIds.length > 0) {
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
          xLabel: xColumn?.label ?? "",
          yLabel: yColumn.label,
          format: yColumn.format,
          xFormat: xColumn?.format,
          scatterData,
          barData,
        };
      });
  }, [graphsState.graphs, resolvedByMode, teamAggregatesByMode]);

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
  function emptyMessageFor(item: { dataView: AnalysisMode; scope: SummaryTileScope }): string | undefined {
    if (!needsHistoric(item) || historicStatus === "ready") return undefined;
    return historicStatus === "error" ? "Historic data couldn't be loaded." : "Loading historic data…";
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
    setNewTilePlayerMode(tile.playerIds && tile.playerIds.length > 0 ? "players" : "filters");
    setNewTilePlayerIds(tile.playerIds ?? []);
    setNewTileTeamMode(tile.teamIds && tile.teamIds.length > 0 ? "selected" : "all");
    setNewTileTeamIds(tile.teamIds ?? []);
    setNewTileError(null);
    setEditingTileId(tile.id);
    setShowAddTileModal(true);
  }

  function closeAddTileModal() {
    setShowAddTileModal(false);
  }

  function handleMetricChange(key: string) {
    setNewTileMetricKey(key);
    const metric = tileView === "player" ? playerTileMetricByKey(key) : teamTileMetricByKey(key);
    if (metric) setNewTileDirection(metric.higherIsBetter ? "desc" : "asc");
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

  const trimmedNewTileName = newTileName.trim();
  const newTileNameMissing = trimmedNewTileName.length === 0;
  const newTilePlayersMissing = tileView === "player" && newTilePlayerMode === "players" && newTilePlayerIds.length === 0;
  const newTileTeamsMissing = tileView === "team" && newTileTeamMode === "selected" && newTileTeamIds.length === 0;
  const newTilePriceProblem = tileView === "player" && newTilePlayerMode === "filters" ? priceRangeProblem(newTileCriteria) : undefined;
  const addTileDisabled = newTileNameMissing || newTilePlayersMissing || newTileTeamsMissing || !!newTilePriceProblem;
  const addTileDisabledReason = newTileNameMissing
    ? "Name is required"
    : newTilePlayersMissing
      ? "Select at least one player to track"
      : newTileTeamsMissing
        ? "Select at least one team to track"
        : newTilePriceProblem;

  function handleAddTile() {
    if (addTileDisabled) return;
    const settings = {
      metricKey: newTileMetricKey,
      direction: newTileDirection,
      dataView: newTileDataView,
      name: trimmedNewTileName,
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
        `You already have ${MAX_SUMMARY_TILES} tiles across Players and Teams (${here} here, ${other} in ${tileView === "player" ? "Teams" : "Players"}) — the maximum allowed. Remove one first.`,
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
    setNewGraphPlayerMode(graph.playerIds && graph.playerIds.length > 0 ? "players" : "filters");
    setNewGraphPlayerIds(graph.playerIds ?? []);
    setNewGraphTeamMode(graph.teamIds && graph.teamIds.length > 0 ? "selected" : "all");
    setNewGraphTeamIds(graph.teamIds ?? []);
    setNewGraphError(null);
    setEditingGraphId(graph.id);
    setShowAddGraphModal(true);
  }

  function closeAddGraphModal() {
    setShowAddGraphModal(false);
  }

  /** Same as handleMetricChange for tiles: a new metric starts in its natural order. */
  function handleGraphYMetricChange(key: string) {
    setNewGraphYKey(key);
    setNewGraphDirection(defaultGraphDirection(tileView, key));
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

  const trimmedNewGraphName = newGraphName.trim();
  const newGraphNameMissing = trimmedNewGraphName.length === 0;
  const newGraphPlayersMissing = tileView === "player" && newGraphPlayerMode === "players" && newGraphPlayerIds.length === 0;
  const newGraphTeamsMissing = tileView === "team" && newGraphTeamMode === "selected" && newGraphTeamIds.length === 0;
  const newGraphPriceProblem = tileView === "player" && newGraphPlayerMode === "filters" ? priceRangeProblem(newGraphCriteria) : undefined;
  const addGraphDisabled = newGraphNameMissing || newGraphPlayersMissing || newGraphTeamsMissing || !!newGraphPriceProblem;
  const addGraphDisabledReason = newGraphNameMissing
    ? "Name is required"
    : newGraphPlayersMissing
      ? "Select at least one player to plot"
      : newGraphTeamsMissing
        ? "Select at least one team to plot"
        : newGraphPriceProblem;

  function handleAddGraph() {
    if (addGraphDisabled) return;
    const settings = {
      name: trimmedNewGraphName,
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
        `You already have ${MAX_DASHBOARD_GRAPHS} graphs across Players and Teams (${here} here, ${other} in ${tileView === "player" ? "Teams" : "Players"}) — the maximum allowed. Remove one first.`,
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
  const anyDialogOpen = showAddTileModal || showAddGraphModal || showCreateViewModal || showDeleteViewConfirm;
  useEffect(() => {
    if (!anyDialogOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setShowAddTileModal(false);
      setShowAddGraphModal(false);
      setShowCreateViewModal(false);
      setShowDeleteViewConfirm(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyDialogOpen]);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1>Dashboard</h1>
          <div className="icon-toolbar">
            <button
              type="button"
              className={`chip chip-icon${tileView === "player" ? " active" : ""}`}
              title="Players — track player-based leaderboards"
              aria-label="Players"
              aria-pressed={tileView === "player"}
              onClick={() => changeTileView("player")}
            >
              <PlayersViewIcon />
            </button>
            <button
              type="button"
              className={`chip chip-icon${tileView === "team" ? " active" : ""}`}
              title="Teams — track team-based leaderboards"
              aria-label="Teams"
              aria-pressed={tileView === "team"}
              onClick={() => changeTileView("team")}
            >
              <TeamsViewIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <CalendarIcon />
          <div className="summary-card-label">Gameweek Status</div>
          <div className="summary-card-value" style={{ fontSize: 17 }}>
            {gwDisplay.heading}
          </div>
          <div className="summary-card-sub">{gwDisplay.sub}</div>
          {gwDisplay.progress !== null && (
            <div className="summary-card-progress-track" title={`${gwDisplay.progress.toFixed(0)}% of the way to this deadline`}>
              <div className="summary-card-progress-fill" style={{ width: `${gwDisplay.progress}%` }} />
            </div>
          )}
        </div>
        <div className="card">
          <UsersIcon />
          <div className="summary-card-label">Players Tracked</div>
          <div className="summary-card-value">{players.length.toLocaleString("en-GB")}</div>
        </div>
        <div className="card">
          <ClockIcon />
          <div className="summary-card-label">Data Last Updated</div>
          <div className="summary-card-value" style={{ fontSize: 17 }}>
            {fmtTimeAgo(lastUpdated)}
          </div>
        </div>
      </div>

      {usesHistoricData && historicStatus === "loading" && (
        <div className="empty-state">
          <h3>Building the historic dataset…</h3>
          <p>This runs once per session and can take up to a minute — it'll be quick after that. Needed because at least one tile or graph uses Last Completed Season, Historic Average, or team figures.</p>
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
          {historicSkippedPlayerIds.length} player(s) had no historic data available this session (a transient fetch issue) — everyone else
          is unaffected.
        </p>
      )}

      <div className="stat-group-title">Summary Tiles</div>
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
          title={selectedViewIsDefault ? "The Default view can't be deleted" : "Delete View"}
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
            const onRemove = selectedViewIsDefault ? undefined : () => tilesState.removeTile(tile.id);
            if (row.kind === "unavailable") {
              return <UnavailableItemCard key={tile.id} title={tile.name?.trim() || "Unavailable tile"} noun="tile" onRemove={onRemove} />;
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
              title: displayTileTitle(tile, row.metric.label),
              format: row.metric.format,
              dataView: tile.dataView,
              emptyMessage: emptyMessageFor(tile),
              onEdit: selectedViewIsDefault ? undefined : () => openEditTileModal(tile),
              onRemove,
              ...dragProps,
            };
            return row.kind === "player" ? (
              <TopList key={tile.id} {...common} rows={row.topRows as TopListRow[]} onSelect={select} signed={row.metric.signed} />
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

      <hr className="section-divider" />
      <div className="stat-group-title">Graphs</div>

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
                  onRemove={selectedViewIsDefault ? undefined : () => graphsState.removeGraph(graph.id)}
                />
              );
            }
            const { kind, xLabel, yLabel, format, xFormat, scatterData, barData } = row;
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
              format={format}
              xFormat={xFormat}
              ascending={graph.direction === "asc"}
              emptyMessage={emptyMessageFor(graph)}
              showReferenceLine={graph.showReferenceLine}
              dataView={graph.dataView}
              onSelect={kind === "player" ? select : selectTeam}
              draggable={!selectedViewIsDefault}
              isDragOver={dragOverGraphId === graph.id}
              onDragStart={(e) => handleGraphDragStart(e, graph.id)}
              onDragOver={(e) => handleGraphDragOver(e, graph.id)}
              onDragLeave={() => setDragOverGraphId((k) => (k === graph.id ? null : k))}
              onDrop={(e) => handleGraphDrop(e, graph.id)}
              onEdit={selectedViewIsDefault ? undefined : () => openEditGraphModal(graph)}
              onRemove={selectedViewIsDefault ? undefined : () => graphsState.removeGraph(graph.id)}
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
                value={newTileName}
                onChange={(e) => setNewTileName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-tile-metric">Statistic</label>
              <select id="new-tile-metric" value={newTileMetricKey} onChange={(e) => handleMetricChange(e.target.value)}>
                {(tileView === "player" ? PLAYER_TILE_METRICS : TEAM_TILE_METRICS).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-tile-dataview">Data View</label>
              <select id="new-tile-dataview" value={newTileDataView} onChange={(e) => setNewTileDataView(e.target.value as AnalysisMode)}>
                {ANALYSIS_MODE_OPTIONS.map((o) => (
                  <option key={o.mode} value={o.mode}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-tile-direction">Order</label>
              <select id="new-tile-direction" value={newTileDirection} onChange={(e) => setNewTileDirection(e.target.value as TileDirection)}>
                <option value="desc">Highest first</option>
                <option value="asc">Lowest first</option>
              </select>
            </div>
            {tileView === "player" && (
              <>
                <div className="chip-row" style={{ marginTop: 14, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`chip chip-icon${newTilePlayerMode === "filters" ? " active" : ""}`}
                    title="Filters — narrow by position, team, and minutes"
                    aria-label="Filters"
                    aria-pressed={newTilePlayerMode === "filters"}
                    onClick={() => togglePlayerTileMode("filters")}
                  >
                    <FilterIcon />
                  </button>
                  <button
                    type="button"
                    className={`chip chip-icon${newTilePlayerMode === "players" ? " active" : ""}`}
                    title="Player Search — track up to 5 specific players"
                    aria-label="Player Search"
                    aria-pressed={newTilePlayerMode === "players"}
                    onClick={() => togglePlayerTileMode("players")}
                  >
                    <PlayerSearchIcon />
                  </button>
                </div>
                {newTilePlayerMode === "filters" ? (
                  <FiltersBar
                    idPrefix="new-tile-criteria"
                    filters={newTileCriteria}
                    onChange={setNewTileCriteria}
                    onReset={() => setNewTileCriteria(DEFAULT_FILTERS)}
                    analysisMode={newTileDataView}
                    showSearch={false}
                    showPrice
                    minMinutesInLive
                  />
                ) : (
                  <>
                    {newTilePlayerIds.length > 0 && (
                      <div className="chip-row" style={{ marginBottom: 8 }}>
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
                <div className="chip-row" style={{ marginTop: 14, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`chip chip-icon${newTileTeamMode === "all" ? " active" : ""}`}
                    title="All Teams — rank every team"
                    aria-label="All Teams"
                    aria-pressed={newTileTeamMode === "all"}
                    onClick={() => toggleTeamTileMode("all")}
                  >
                    <AllTeamsIcon />
                  </button>
                  <button
                    type="button"
                    className={`chip chip-icon${newTileTeamMode === "selected" ? " active" : ""}`}
                    title="Team Selection — track up to 5 specific teams"
                    aria-label="Team Selection"
                    aria-pressed={newTileTeamMode === "selected"}
                    onClick={() => toggleTeamTileMode("selected")}
                  >
                    <TeamSelectionIcon />
                  </button>
                </div>
                {newTileTeamMode === "selected" && (
                  <>
                    {newTileTeamIds.length > 0 && (
                      <div className="chip-row" style={{ marginBottom: 8 }}>
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
            {newTileError && <div className="banner error">{newTileError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeAddTileModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAddTile} disabled={addTileDisabled} title={addTileDisabledReason}>
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
                value={newGraphName}
                onChange={(e) => setNewGraphName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-graph-type">Graph Type</label>
              <select id="new-graph-type" value={newGraphChartType} onChange={(e) => setNewGraphChartType(e.target.value as DashboardGraphType)}>
                <option value="scatter">Scatter Plot (metric vs metric)</option>
                <option value="bar">Bar Chart (top 15 by metric)</option>
              </select>
            </div>
            {newGraphChartType === "scatter" && (
              <div className="field">
                <label htmlFor="new-graph-x">X axis metric</label>
                <select id="new-graph-x" value={newGraphXKey} onChange={(e) => setNewGraphXKey(e.target.value)}>
                  {(tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="new-graph-y">{newGraphChartType === "scatter" ? "Y axis metric" : "Metric"}</label>
              <select id="new-graph-y" value={newGraphYKey} onChange={(e) => handleGraphYMetricChange(e.target.value)}>
                {(tileView === "player" ? PLAYER_COLUMNS : TEAM_COLUMNS).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-graph-dataview">Data View</label>
              <select id="new-graph-dataview" value={newGraphDataView} onChange={(e) => setNewGraphDataView(e.target.value as AnalysisMode)}>
                {ANALYSIS_MODE_OPTIONS.map((o) => (
                  <option key={o.mode} value={o.mode}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {newGraphChartType === "bar" && (
              <div className="field">
                <label htmlFor="new-graph-direction">Order</label>
                <select id="new-graph-direction" value={newGraphDirection} onChange={(e) => setNewGraphDirection(e.target.value as TileDirection)}>
                  <option value="desc">Highest first</option>
                  <option value="asc">Lowest first</option>
                </select>
              </div>
            )}
            {newGraphChartType === "scatter" && (
              <div className="chip-row" style={{ marginTop: 10 }}>
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
            )}
            {tileView === "player" && (
              <>
                <div className="chip-row" style={{ marginTop: 14, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`chip chip-icon${newGraphPlayerMode === "filters" ? " active" : ""}`}
                    title="Filters — narrow by position, team, and minutes"
                    aria-label="Filters"
                    aria-pressed={newGraphPlayerMode === "filters"}
                    onClick={() => togglePlayerGraphMode("filters")}
                  >
                    <FilterIcon />
                  </button>
                  <button
                    type="button"
                    className={`chip chip-icon${newGraphPlayerMode === "players" ? " active" : ""}`}
                    title="Player Search — plot up to 5 specific players"
                    aria-label="Player Search"
                    aria-pressed={newGraphPlayerMode === "players"}
                    onClick={() => togglePlayerGraphMode("players")}
                  >
                    <PlayerSearchIcon />
                  </button>
                </div>
                {newGraphPlayerMode === "filters" ? (
                  <FiltersBar
                    idPrefix="new-graph-criteria"
                    filters={newGraphCriteria}
                    onChange={setNewGraphCriteria}
                    onReset={() => setNewGraphCriteria(DEFAULT_FILTERS)}
                    analysisMode={newGraphDataView}
                    showSearch={false}
                    showPrice
                    minMinutesInLive
                  />
                ) : (
                  <>
                    {newGraphPlayerIds.length > 0 && (
                      <div className="chip-row" style={{ marginBottom: 8 }}>
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
                <div className="chip-row" style={{ marginTop: 14, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`chip chip-icon${newGraphTeamMode === "all" ? " active" : ""}`}
                    title="All Teams — plot every team"
                    aria-label="All Teams"
                    aria-pressed={newGraphTeamMode === "all"}
                    onClick={() => toggleTeamGraphMode("all")}
                  >
                    <AllTeamsIcon />
                  </button>
                  <button
                    type="button"
                    className={`chip chip-icon${newGraphTeamMode === "selected" ? " active" : ""}`}
                    title="Team Selection — plot up to 5 specific teams"
                    aria-label="Team Selection"
                    aria-pressed={newGraphTeamMode === "selected"}
                    onClick={() => toggleTeamGraphMode("selected")}
                  >
                    <TeamSelectionIcon />
                  </button>
                </div>
                {newGraphTeamMode === "selected" && (
                  <>
                    {newGraphTeamIds.length > 0 && (
                      <div className="chip-row" style={{ marginBottom: 8 }}>
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
            {newGraphError && <div className="banner error">{newGraphError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeAddGraphModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAddGraph} disabled={addGraphDisabled} title={addGraphDisabledReason}>
                {editingGraphId ? "Save Changes" : "Add Graph"}
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
