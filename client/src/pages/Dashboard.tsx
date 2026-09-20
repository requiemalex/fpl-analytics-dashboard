import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { filterPlayers } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
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
import { useSummaryTiles, createSummaryTile, MAX_SUMMARY_TILES, type TileDirection } from "../state/useSummaryTiles";
import { fmtDate, fmtTimeAgo } from "../utils/format";
import type { NormalizedTeam } from "../types/normalized";

function topN<T extends { value: number | null }>(rowsIn: T[], n: number, ascending = false): T[] {
  const eligible = rowsIn.filter((r) => r.value !== null);
  eligible.sort((a, b) => ((a.value as number) < (b.value as number) ? 1 : -1));
  const sorted = ascending ? eligible.slice().reverse() : eligible;
  return sorted.slice(0, n);
}

function nullSafeSum(values: (number | null)[]): number | null {
  const nonNull = values.filter((v): v is number => v !== null);
  return nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) : null;
}

function tileTitle(metricLabel: string, direction: TileDirection): string {
  return `${direction === "desc" ? "Top" : "Bottom"} 5 — ${metricLabel}`;
}

export function Dashboard() {
  const { players, teams, gameweekState, events, lastUpdated, historicProfiles, historicStatus, currentSeasonHasStarted } = useAppState();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // This page's own analysis-mode — deliberately not shared with any
  // other page (see state/scoutingFilters.ts) — governs the Gameweek
  // Status cards and both tile scopes below (a squad total needs some
  // season basis too). `tileFilters` is separate again: the criteria
  // search/position/team/min-minutes bar shown alongside the PLAYER
  // summary tiles specifically — it narrows which individual players
  // feed those leaderboards, and deliberately has no effect on team
  // tiles at all, which already aggregate a team's whole squad
  // regardless of any player-level filter (see teamAggregates below).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const [tileFilters, setTileFilters] = useState<GlobalScoutingFilters>(DEFAULT_FILTERS);
  const resetTileFilters = () => setTileFilters(DEFAULT_FILTERS);

  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // The full search/position/team/min-minutes criteria — same shared
  // filterPlayers() every other page uses — narrows which players feed
  // the PLAYER-scope Top-5 leaderboards below. A player with no data for
  // this mode (minutes null) can't clear the minutes bar, so they're
  // correctly excluded here too — never surfaced as a misleading zero.
  const eligible = useMemo(() => filterPlayers(resolvedPlayers, tileFilters, analysisMode), [resolvedPlayers, tileFilters, analysisMode]);

  const rows = useMemo(() => eligible.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [eligible]);

  // A rate-per-game metric (PPG, Goals/Game, Assists/Game, DC/Game — see
  // PlayerTileMetric.ratePerMinutes) still needs a real sample to mean
  // anything, even now that the underlying calculation itself is
  // per-game rather than per-90-minutes (see <per_game_not_per_90> in
  // metrics/calculations.ts, which fixed the raw amplification bug this
  // was originally written to guard against). A one-or-two-appearance
  // sample can still read as a better rate than a player's normal
  // output. This page has no Min Minutes control of its own (unlike
  // Player Explorer/Underlying Numbers/Team Building), and the shared
  // global filter defaults to 0, so without this a tiny-sample outlier
  // could silently top one of these Top-5 leaderboards. `Math.max`
  // against the shared filter means a stricter min-minutes set
  // elsewhere is never loosened.
  //
  // Current Season gets its own, much lower floor (one full match)
  // rather than being exempted entirely, since everyone genuinely has
  // low minutes for only the first couple of gameweeks — by gameweek 5+
  // a bench cameo and a genuine starter both count as "low minutes"
  // under a 450-minute bar, and only the former deserves excluding. 90
  // minutes is never too strict to be reachable — any player who's
  // started and finished a single match already clears it. Last
  // Completed Season / Historic Average keep the stricter ~5-games bar,
  // reusing the same threshold Underlying Numbers' defensive-reward
  // chart already enforces for genuine ranking confidence over a
  // completed season's full data. Filters `eligible` (not
  // `resolvedPlayers` directly) so the criteria bar's search/position/
  // team narrowing still applies on top of this stricter floor — the
  // two are complementary, not alternatives.
  const LIVE_RATE_STAT_MIN_MINUTES = 90;
  const RATE_STAT_MIN_MINUTES = 450;
  const rateEligible = useMemo(() => {
    const floor = analysisMode === "live" ? LIVE_RATE_STAT_MIN_MINUTES : RATE_STAT_MIN_MINUTES;
    return eligible.filter((p) => p.minutes !== null && p.minutes >= floor);
  }, [eligible, analysisMode]);

  const rateRows = useMemo(() => rateEligible.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [rateEligible]);

  // Team snapshot — same aggregation basis as the Teams page (every
  // resolved player attributed to their current club, not minutes-
  // filtered), so these numbers match what you'd see if you clicked
  // through to Teams rather than looking like a second, different total.
  const teamAggregates: TeamAggregate[] = useMemo(() => {
    return teams.map((team: NormalizedTeam) => {
      const squad = resolvedPlayers.filter((p) => p.teamId === team.id);
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
  }, [resolvedPlayers, teams]);

  // ---------- Summary Tiles ----------
  //
  // User-built and user-ordered, persisted to localStorage (useSummaryTiles)
  // — starts out matching the fixed leaderboards this page always showed,
  // so nothing changes for anyone until they open "+ Add Tile" themselves.
  const tilesState = useSummaryTiles();
  const [dragOverTileId, setDragOverTileId] = useState<string | null>(null);
  const [showAddTileModal, setShowAddTileModal] = useState(false);
  const [newTileScope, setNewTileScope] = useState<SummaryTileScope>("player");
  const [newTileMetricKey, setNewTileMetricKey] = useState<string>(PLAYER_TILE_METRICS[0].key);
  const [newTileDirection, setNewTileDirection] = useState<TileDirection>("desc");
  const [newTileError, setNewTileError] = useState<string | null>(null);

  const tileRows = useMemo(() => {
    return tilesState.tiles
      .map((tile) => {
        if (tile.scope === "player") {
          const metric = playerTileMetricByKey(tile.metricKey);
          if (!metric) return null;
          const sourceRows = metric.ratePerMinutes ? rateRows : rows;
          const valueRows: TopListRow[] = sourceRows.map((r) => ({ player: r.player, value: metric.getValue(r.player, r.derived) }));
          return { tile, metric, kind: "player" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
        }
        const metric = teamTileMetricByKey(tile.metricKey);
        if (!metric) return null;
        const valueRows: TeamTopListRow[] = teamAggregates.map((t) => ({
          teamId: t.teamId,
          name: t.name,
          shortName: t.shortName,
          value: metric.getValue(t),
        }));
        return { tile, metric, kind: "team" as const, topRows: topN(valueRows, 5, tile.direction === "asc") };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [tilesState.tiles, rows, rateRows, teamAggregates]);

  // Split for rendering only — reordering still operates on the one
  // underlying `tilesState.tiles` array regardless of scope (drag-drop
  // is id-based, not index-based, so filtering the rendered view here
  // doesn't affect it), this just keeps player and team tiles visually
  // separated with their own heading, since the criteria bar above only
  // ever applies to the player ones.
  const playerTileRows = useMemo(() => tileRows.filter((t) => t.kind === "player"), [tileRows]);
  const teamTileRows = useMemo(() => tileRows.filter((t) => t.kind === "team"), [tileRows]);

  function openAddTileModal() {
    setNewTileScope("player");
    setNewTileMetricKey(PLAYER_TILE_METRICS[0].key);
    setNewTileDirection(PLAYER_TILE_METRICS[0].higherIsBetter ? "desc" : "asc");
    setNewTileError(null);
    setShowAddTileModal(true);
  }

  function closeAddTileModal() {
    setShowAddTileModal(false);
  }

  function handleScopeChange(scope: SummaryTileScope) {
    setNewTileScope(scope);
    const firstMetric = scope === "player" ? PLAYER_TILE_METRICS[0] : TEAM_TILE_METRICS[0];
    setNewTileMetricKey(firstMetric.key);
    setNewTileDirection(firstMetric.higherIsBetter ? "desc" : "asc");
  }

  function handleMetricChange(key: string) {
    setNewTileMetricKey(key);
    const metric = newTileScope === "player" ? playerTileMetricByKey(key) : teamTileMetricByKey(key);
    if (metric) setNewTileDirection(metric.higherIsBetter ? "desc" : "asc");
  }

  function handleAddTile() {
    if (tilesState.tiles.length >= MAX_SUMMARY_TILES) {
      setNewTileError(`You already have ${MAX_SUMMARY_TILES} tiles — the maximum allowed. Remove one first.`);
      return;
    }
    tilesState.addTile(createSummaryTile(newTileScope, newTileMetricKey, newTileDirection));
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
  const gwLabel =
    gameweekState?.kind === "current"
      ? gameweekState.event.finished
        ? (() => {
            const next = events.find((e) => e.isNext);
            return next ? `${next.name} deadline ${fmtDate(next.deadlineTime)}` : `${gameweekState.event.name} finished`;
          })()
        : `${gameweekState.event.name} deadline ${fmtDate(gameweekState.event.deadlineTime)}`
      : gameweekState?.kind === "last-completed"
        ? `Last completed: ${gameweekState.event.name}`
        : "Pre-season / No active gameweek";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
        </div>
      </div>

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

      <div className="card-grid">
        <div className="card">
          <div className="card-title">Gameweek Status</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{gwLabel}</div>
        </div>
        <div className="card">
          <div className="card-title">Players Tracked</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{resolvedPlayers.length.toLocaleString("en-GB")}</div>
        </div>
        <div className="card">
          <div className="card-title">Data Last Updated</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtTimeAgo(lastUpdated)}</div>
        </div>
      </div>

      {eligible.length === 0 && analysisMode !== "live" && historicStatus === "loading" && (
        <div className="empty-state">
          <h3>Building the historic dataset…</h3>
          <p>This runs once per session and can take up to a minute — it'll be quick after that.</p>
        </div>
      )}

      <div className="stat-group-title">Summary Tiles</div>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button type="button" className="chip" onClick={openAddTileModal}>
          + Add Tile
        </button>
        <button type="button" className="chip" onClick={tilesState.resetTiles} title="Restore the default tiles and order">
          Reset to Defaults
        </button>
      </div>

      {playerTileRows.length > 0 && (
        <>
          <div className="stat-group-title">Player Tiles</div>
          <FiltersBar
            idPrefix="dash-tiles"
            filters={tileFilters}
            onChange={setTileFilters}
            onReset={resetTileFilters}
            analysisMode={analysisMode}
          />
          <div className="card-grid">
            {playerTileRows.map(({ tile, metric, topRows }) => (
              <TopList
                key={tile.id}
                title={tileTitle(metric.label, tile.direction)}
                rows={topRows as TopListRow[]}
                format={metric.format}
                onSelect={select}
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
        </>
      )}

      {playerTileRows.length > 0 && teamTileRows.length > 0 && <hr className="section-divider" />}

      {teamTileRows.length > 0 && (
        <>
          <div className="stat-group-title team">
            Team Tiles <span className="page-subtitle" style={{ display: "inline", margin: 0 }}>— unaffected by the criteria above</span>
          </div>
          <div className="card-grid">
            {teamTileRows.map(({ tile, metric, topRows }) => (
              <TeamTopList
                key={tile.id}
                title={tileTitle(metric.label, tile.direction)}
                rows={topRows as TeamTopListRow[]}
                format={metric.format}
                onSelect={selectTeam}
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
        </>
      )}

      {tileRows.length === 0 && <p className="page-subtitle">No summary tiles yet — add one above.</p>}

      {showAddTileModal && (
        <div className="dialog-backdrop" onClick={closeAddTileModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add Tile</div>
            <div className="field">
              <label htmlFor="new-tile-scope">Scope</label>
              <select id="new-tile-scope" value={newTileScope} onChange={(e) => handleScopeChange(e.target.value as SummaryTileScope)}>
                <option value="player">Player</option>
                <option value="team">Team (squad totals)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-tile-metric">Statistic</label>
              <select id="new-tile-metric" value={newTileMetricKey} onChange={(e) => handleMetricChange(e.target.value)}>
                {(newTileScope === "player" ? PLAYER_TILE_METRICS : TEAM_TILE_METRICS).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
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
    </div>
  );
}
