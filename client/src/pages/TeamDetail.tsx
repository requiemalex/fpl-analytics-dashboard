import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PositionBadge, TeamBadge, AvailabilityFlag, availabilityTextClass } from "../components/primitives";
import { columnByKey, isStaticColumn } from "../components/playerColumns";
import { fmtPrice } from "../utils/format";

const TEAM_RANKING_METRICS = ["totalPoints", "xG", "xA", "xGI", "xGIPerGame", "goals", "assists", "pointsPerMillion"];

export function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const { players, teamsById, historicProfiles, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [metricKey, setMetricKey] = useState("totalPoints");
  // This page's own analysis-mode — deliberately not shared with any
  // other page (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");

  const team = teamId ? teamsById.get(Number(teamId)) : undefined;
  const column = columnByKey(metricKey)!;

  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Price in the identity cluster is always live, regardless of mode —
  // matching Team Building and the profile header.
  const livePlayersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const squad = useMemo(() => {
    if (!team) return [];
    const list = resolvedPlayers
      .filter((p) => p.teamId === team.id)
      .map((p) => ({ player: p, value: column.getValue(p, getPlayerDerivedMetrics(p)) }));
    list.sort((a, b) => {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    });
    return list;
  }, [resolvedPlayers, team, column]);

  if (!team) {
    return (
      <div className="empty-state">
        <h3>Team not found</h3>
        <button className="btn" onClick={() => navigate("/teams")}>
          Back to Teams
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TeamBadge teamId={team.id} shortName={team.shortName} />
            {team.name}
          </h1>
          <p className="page-subtitle">
            {team.played} played · {team.wins}W {team.draws}D {team.losses}L
          </p>
        </div>
        <button className="btn" onClick={() => navigate("/teams")}>
          Back to Teams
        </button>
      </div>

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="t-metric">Rank by</label>
          <select id="t-metric" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            {TEAM_RANKING_METRICS.map((k) => (
              <option key={k} value={k}>
                {columnByKey(k)?.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Player</th>
              <th
                className={isStaticColumn(column) ? "col-static" : undefined}
                title={isStaticColumn(column) ? "Always today's live figure, regardless of the toggle above" : undefined}
              >
                {column.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {squad.map(({ player, value }) => (
              <tr key={player.id} onClick={() => setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(player.id) }))}>
                <td className="sticky-col">
                  <div className="player-name-cell">
                    <span className={`name ${availabilityTextClass(player.status)}`}>
                      {player.name}
                      <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
                    </span>
                    <span className="meta">
                      <PositionBadge position={player.position} /> {fmtPrice(livePlayersById.get(player.id)?.price ?? player.price)}
                    </span>
                  </div>
                </td>
                <td>{column.format(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
