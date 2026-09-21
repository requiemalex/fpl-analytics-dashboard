import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { filterPlayers } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { ANALYSIS_MODE_OPTIONS } from "../components/AnalysisModeToggle";
import { FiltersBar } from "../components/FiltersBar";
import { TopList, type TopListRow } from "../components/TopList";
import { TeamTopList, type TeamTopListRow } from "../components/TeamTopList";
import {
  PLAYER_TILE_METRICS,
  TEAM_TILE_METRICS,
  playerTileMetricByKey,
  teamTileMetricByKey,
  type SummaryTileScope,
  type TeamAggregate,
} from "../components/summaryTileMetrics";
import { useSummaryTiles, createSummaryTile, MAX_SUMMARY_TILES, type TileDirection, type SummaryTileConfig } from "../state/useSummaryTiles";
import { useSavedDashboardViews, isDefaultSavedView, MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE, type SavedDashboardView } from "../state/useSavedDashboardViews";
import { fmtDate, fmtTimeAgo } from "../utils/format";
import type { NormalizedTeam } from "../types/normalized";

const ACTIVE_TOGGLE_STYLE = { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" };

/** Every mode a tile can be built from — used to pre-compute one resolved/eligible/aggregate bucket per mode (see below), since tiles now each carry their own data view rather than sharing one page-wide mode. */
const MODES: AnalysisMode[] = ["live", "lastSeason", "historicAverage"];

export function topN<T extends { value: number | null }>(rowsIn: T[], n: number, ascending = false): T[] {
  const eligible = rowsIn.filter((r) => r.value !== null) as (T & { value: number })[];
  eligible.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  return eligible.slice(0, n);
}

function nullSafeSum(values: (number | null)[]): number | null {
  const nonNull = values.filter((v): v is number => v !== null);
  return nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) : null;
}

function tileTitle(metricLabel: string, direction: TileDirection): string {
  return `${direction === "desc" ? "Top" : "Bottom"} 5 — ${metricLabel}`;
}

/** A tile's custom name (set once at creation) if it has one, else the auto-generated "Top/Bottom 5 — <metric>" title. */
function displayTileTitle(tile: SummaryTileConfig, metricLabel: string): string {
  return tile.name && tile.name.trim() ? tile.name : tileTitle(metricLabel, tile.direction);
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

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-card-icon">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.6 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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
  } = useAppState();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  // A rate-per-game metric (PPG, Goals/Game, Assists/Game, DC/Game — see
  // PlayerTileMetric.ratePerMinutes) still needs a real sample to mean
  // anything, even with the estimated-games basis (see
  // <per_game_not_per_90> in metrics/calculations.ts). Current Season gets
  // its own, much lower floor (one full match) rather than being exempted
  // entirely, since everyone genuinely has low minutes for only the first
  // couple of gameweeks. Applied per-tile below, on top of that tile's own
  // criteria filter.
  const LIVE_RATE_STAT_MIN_MINUTES = 90;
  const RATE_STAT_MIN_MINUTES = 450;

  // Team snapshot — same aggregation basis as the Teams page (every
  // resolved player attributed to their current club, not minutes- or
  // criteria-filtered), computed per mode since a squad total needs its
  // own season basis too.
  const teamAggregatesByMode = useMemo(() => {
    const map = {} as Record<AnalysisMode, TeamAggregate[]>;
    for (const mode of MODES) {
      map[mode] = teams.map((team: NormalizedTeam) => {
        const squad = resolvedByMode[mode].filter((p) => p.teamId === team.id);
        return {
          teamId: team.id,
          name: team.name,
          shortName: team.shortName,
          points: nullSafeSum(squad.map((p) => p.totalPoints)),
          xGI: nullSafeSum(squad.map((p) => p.xGI)),
          cleanSheets: nullSafeSum(squad.map((p) => p.cleanSheets)),
          goals: nullSafeSum(squad.map((p) => p.goals)),
          assists: nullSafeSum(squad.map((p) => p.assists)),
          bonus: nullSafeSum(squad.map((p) => p.bonus)),
        };
      });
    }
    return map;
  }, [resolvedByMode, teams]);

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
  const [newTileError, setNewTileError] = useState<string | null>(null);

  // ---------- Saved Dashboard Views ----------
  //
  // A named snapshot of the CURRENT scope's tiles, up to
  // MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE each for Player and Team — same
  // no-account, localStorage-only model as saved squads. Loading a view
  // replaces the live tiles for that scope only; the other scope is
  // untouched.
  const savedDashboardViews = useSavedDashboardViews();
  const [selectedViewId, setSelectedViewId] = useState<string>("");
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [saveViewError, setSaveViewError] = useState<string | null>(null);
  const [loadViewError, setLoadViewError] = useState<string | null>(null);

  const visibleSavedViews = useMemo(
    () => savedDashboardViews.views.filter((v) => v.scope === tileView),
    [savedDashboardViews.views, tileView],
  );
  const selectedViewIsDefault = useMemo(() => {
    const view = visibleSavedViews.find((v) => v.id === selectedViewId);
    return view ? isDefaultSavedView(view) : false;
  }, [visibleSavedViews, selectedViewId]);

  function changeTileView(scope: SummaryTileScope) {
    setTileView(scope);
    setSelectedViewId("");
    setLoadViewError(null);
  }

  function openSaveViewModal() {
    setNewViewName("");
    setSaveViewError(null);
    setShowSaveViewModal(true);
  }

  function closeSaveViewModal() {
    setShowSaveViewModal(false);
  }

  function handleSaveView() {
    const name = newViewName.trim();
    if (!name) {
      setSaveViewError("Enter a name for this view.");
      return;
    }
    if (visibleSavedViews.length >= MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE) {
      setSaveViewError(`You already have ${MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE} saved ${tileView} views — the maximum allowed. Delete one first.`);
      return;
    }
    const scopeTiles = tilesState.tiles.filter((t) => t.scope === tileView);
    savedDashboardViews.save(tileView, name, scopeTiles);
    setShowSaveViewModal(false);
  }

  function handleLoadView(view: SavedDashboardView) {
    const otherScopeCount = tilesState.tiles.filter((t) => t.scope !== tileView).length;
    if (otherScopeCount + view.tiles.length > MAX_SUMMARY_TILES) {
      setLoadViewError(`Loading "${view.name}" would push you past the ${MAX_SUMMARY_TILES}-tile limit — remove some tiles first.`);
      return;
    }
    setLoadViewError(null);
    tilesState.replaceScopeTiles(tileView, view.tiles);
  }

  function handleDeleteSelectedView() {
    if (!selectedViewId) return;
    savedDashboardViews.remove(selectedViewId);
    setSelectedViewId("");
  }

  const tileRows = useMemo(() => {
    return tilesState.tiles
      .map((tile) => {
        if (tile.scope === "player") {
          const metric = playerTileMetricByKey(tile.metricKey);
          if (!metric) return null;
          const criteria = tile.criteria ?? DEFAULT_FILTERS;
          let sourcePlayers = filterPlayers(resolvedByMode[tile.dataView], criteria, tile.dataView);
          if (metric.ratePerMinutes) {
            const floor = tile.dataView === "live" ? LIVE_RATE_STAT_MIN_MINUTES : RATE_STAT_MIN_MINUTES;
            sourcePlayers = sourcePlayers.filter((p) => p.minutes !== null && p.minutes >= floor);
          }
          const rows = sourcePlayers.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) }));
          const valueRows: TopListRow[] = rows.map((r) => ({ player: r.player, value: metric.getValue(r.player, r.derived) }));
          return { tile, metric, kind: "player" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
        }
        const metric = teamTileMetricByKey(tile.metricKey);
        if (!metric) return null;
        const valueRows: TeamTopListRow[] = teamAggregatesByMode[tile.dataView].map((t) => ({
          teamId: t.teamId,
          name: t.name,
          shortName: t.shortName,
          value: metric.getValue(t),
        }));
        return { tile, metric, kind: "team" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [tilesState.tiles, resolvedByMode, teamAggregatesByMode]);

  // Split for rendering only — reordering still operates on the one
  // underlying `tilesState.tiles` array regardless of scope (drag-drop
  // is id-based, not index-based), this just picks out whichever scope
  // `tileView` currently has selected.
  const playerTileRows = useMemo(() => tileRows.filter((t) => t.kind === "player"), [tileRows]);
  const teamTileRows = useMemo(() => tileRows.filter((t) => t.kind === "team"), [tileRows]);
  const visibleTileRows = tileView === "player" ? playerTileRows : teamTileRows;

  // Whether any current tile needs the bulk historic dataset at all — only
  // "lastSeason"/"historicAverage" do (see resolvePlayerStats.ts); a
  // dashboard built entirely from Current Season tiles never needs to wait
  // on it.
  const usesHistoricData = tilesState.tiles.some((t) => t.dataView !== "live");

  function openAddTileModal() {
    const firstMetric = tileView === "player" ? PLAYER_TILE_METRICS[0] : TEAM_TILE_METRICS[0];
    setNewTileMetricKey(firstMetric.key);
    setNewTileDirection(firstMetric.higherIsBetter ? "desc" : "asc");
    setNewTileDataView("lastSeason");
    setNewTileName("");
    setNewTileCriteria(DEFAULT_FILTERS);
    setNewTileError(null);
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

  function handleAddTile() {
    if (tilesState.tiles.length >= MAX_SUMMARY_TILES) {
      setNewTileError(`You already have ${MAX_SUMMARY_TILES} tiles — the maximum allowed. Remove one first.`);
      return;
    }
    tilesState.addTile(
      createSummaryTile({
        scope: tileView,
        metricKey: newTileMetricKey,
        direction: newTileDirection,
        dataView: newTileDataView,
        name: newTileName.trim() || null,
        criteria: tileView === "player" ? newTileCriteria : null,
      }),
    );
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

  function select(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  function selectTeam(teamId: number) {
    navigate(`/teams/${teamId}`);
  }

  // Same reasoning as AppShell's GameweekLabel: FPL keeps an event marked
  // "current" until the NEXT one's deadline passes, even after this one's
  // own matches have all finished — so once finished, switch to showing
  // the next gameweek's deadline instead (never the one that just ended).
  // The progress bar tracks time elapsed across whichever deadline window
  // is currently "live" — the previous deadline to this one if it hasn't
  // passed yet, or this (just-passed) deadline to the next one if it has.
  const gwDisplay = useMemo(() => {
    if (gameweekState?.kind === "current") {
      if (gameweekState.event.finished) {
        const next = events.find((e) => e.isNext);
        if (!next) return { heading: gameweekState.event.name, sub: "Finished — awaiting next gameweek", progress: null as number | null };
        return { heading: next.name, sub: `Deadline ${fmtDate(next.deadlineTime)}`, progress: timeProgressPercent(gameweekState.event.deadlineTime, next.deadlineTime) };
      }
      const previous = events.find((e) => e.isPrevious);
      return {
        heading: gameweekState.event.name,
        sub: `Deadline ${fmtDate(gameweekState.event.deadlineTime)}`,
        progress: previous ? timeProgressPercent(previous.deadlineTime, gameweekState.event.deadlineTime) : null,
      };
    }
    if (gameweekState?.kind === "last-completed") {
      return { heading: gameweekState.event.name, sub: "Last completed gameweek", progress: null as number | null };
    }
    return { heading: "Pre-season", sub: "No active gameweek yet", progress: null as number | null };
  }, [gameweekState, events]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn"
            aria-pressed={tileView === "player"}
            style={tileView === "player" ? ACTIVE_TOGGLE_STYLE : undefined}
            onClick={() => changeTileView("player")}
          >
            Players
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={tileView === "team"}
            style={tileView === "team" ? ACTIVE_TOGGLE_STYLE : undefined}
            onClick={() => changeTileView("team")}
          >
            Teams
          </button>
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
          <p>This runs once per session and can take up to a minute — it'll be quick after that. Needed because at least one tile's data view is Last Completed Season or Historic Average.</p>
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
        <button type="button" className="chip" onClick={openAddTileModal}>
          + Add Tile
        </button>
        <button type="button" className="chip" onClick={openSaveViewModal}>
          Save View
        </button>
        {visibleSavedViews.length > 0 && (
          <>
            <select value={selectedViewId} onChange={(e) => setSelectedViewId(e.target.value)}>
              <option value="">Saved views…</option>
              {visibleSavedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip"
              disabled={!selectedViewId}
              onClick={() => {
                const view = visibleSavedViews.find((v) => v.id === selectedViewId);
                if (view) handleLoadView(view);
              }}
            >
              Load
            </button>
            <button
              type="button"
              className="chip"
              disabled={!selectedViewId || selectedViewIsDefault}
              title={selectedViewIsDefault ? "The Default view can't be deleted" : undefined}
              onClick={handleDeleteSelectedView}
            >
              Delete
            </button>
          </>
        )}
      </div>
      {loadViewError && (
        <div className="banner error" style={{ marginBottom: 12 }}>
          {loadViewError}
        </div>
      )}

      {visibleTileRows.length === 0 ? (
        <p className="page-subtitle">No {tileView} tiles yet — add one above.</p>
      ) : tileView === "player" ? (
        <div className="card-grid">
          {playerTileRows.map(({ tile, metric, topRows }) => (
            <TopList
              key={tile.id}
              title={displayTileTitle(tile, metric.label)}
              rows={topRows as TopListRow[]}
              format={metric.format}
              onSelect={select}
              dataView={tile.dataView}
              signed={metric.signed}
              draggable
              isDragOver={dragOverTileId === tile.id}
              onDragStart={(e) => handleTileDragStart(e, tile.id)}
              onDragOver={(e) => handleTileDragOver(e, tile.id)}
              onDragLeave={() => setDragOverTileId((k) => (k === tile.id ? null : k))}
              onDrop={(e) => handleTileDrop(e, tile.id)}
              onRemove={() => tilesState.removeTile(tile.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card-grid">
          {teamTileRows.map(({ tile, metric, topRows }) => (
            <TeamTopList
              key={tile.id}
              title={displayTileTitle(tile, metric.label)}
              rows={topRows as TeamTopListRow[]}
              format={metric.format}
              onSelect={selectTeam}
              dataView={tile.dataView}
              draggable
              isDragOver={dragOverTileId === tile.id}
              onDragStart={(e) => handleTileDragStart(e, tile.id)}
              onDragOver={(e) => handleTileDragOver(e, tile.id)}
              onDragLeave={() => setDragOverTileId((k) => (k === tile.id ? null : k))}
              onDrop={(e) => handleTileDrop(e, tile.id)}
              onRemove={() => tilesState.removeTile(tile.id)}
            />
          ))}
        </div>
      )}

      {showAddTileModal && (
        <div className="dialog-backdrop" onClick={closeAddTileModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add {tileView === "player" ? "Player" : "Team"} Tile</div>
            <div className="field">
              <label htmlFor="new-tile-name">Name (optional)</label>
              <input
                id="new-tile-name"
                type="text"
                placeholder="Auto-generated from statistic + order"
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
              <FiltersBar
                idPrefix="new-tile-criteria"
                filters={newTileCriteria}
                onChange={setNewTileCriteria}
                onReset={() => setNewTileCriteria(DEFAULT_FILTERS)}
                analysisMode={newTileDataView}
              />
            )}
            {newTileError && <div className="banner error">{newTileError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeAddTileModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAddTile}>
                Add Tile
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveViewModal && (
        <div className="dialog-backdrop" onClick={closeSaveViewModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Save {tileView === "player" ? "Player" : "Team"} View</div>
            <div className="field">
              <label htmlFor="new-view-name">Name</label>
              <input
                id="new-view-name"
                type="text"
                placeholder="e.g. Attacking Threats"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveView();
                }}
              />
            </div>
            {saveViewError && <div className="banner error">{saveViewError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeSaveViewModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleSaveView}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
