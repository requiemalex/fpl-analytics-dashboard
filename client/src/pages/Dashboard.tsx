import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
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
  const { players, teams, gameweekState, events, lastUpdated, filters, analysisMode, historicProfiles, historicStatus, currentSeasonHasStarted } =
    useAppState();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // A player with no data for this mode (minutes null) can't clear any
  // minutes bar, so they're correctly excluded from these Top-5
  // leaderboards specifically — same as before, just via a null check
  // instead of the whole player having already been dropped upstream.
  const eligible = useMemo(
    () => resolvedPlayers.filter((p) => p.minutes !== null && p.minutes >= effectiveMinMinutes(filters, analysisMode)),
    [resolvedPlayers, filters.minMinutes, analysisMode],
  );

  const rows = useMemo(() => eligible.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [eligible]);

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
          const valueRows: TopListRow[] = rows.map((r) => ({ player: r.player, value: metric.getValue(r.player, r.derived) }));
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
  }, [tilesState.tiles, rows, teamAggregates]);

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

      <AnalysisModeToggle />

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
      <div className="card-grid">
        {tileRows.map(({ tile, metric, kind, topRows }) =>
          kind === "player" ? (
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
          ) : (
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
          ),
        )}
      </div>
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
