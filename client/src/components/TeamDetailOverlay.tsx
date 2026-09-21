import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures } from "../metrics/fixtureTicker";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, FixtureChips } from "./primitives";
import { fmtDecimal, fmtPrice, DASH } from "../utils/format";
import type { NormalizedTeam } from "../types/normalized";

function useSelectedTeam(): [NormalizedTeam | null, (id: number | null) => void] {
  const { teamsById } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get("teamProfile");
  const team = id ? (teamsById.get(Number(id)) ?? null) : null;

  const setId = (newId: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newId === null) next.delete("teamProfile");
      else next.set("teamProfile", String(newId));
      return next;
    });
  };

  return [team, setId];
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Label-above-value tile — same visual language as the player profile's StatTile, without the percentile tint (there's no cross-team population computed here for a first-draft team profile). */
function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

export function TeamDetailOverlay() {
  const { players, teamsById, fixtures, historicProfiles, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [team, setTeamId] = useSelectedTeam();
  const [, setSearchParams] = useSearchParams();
  // The profile's own analysis-mode — deliberately independent of whatever
  // mode happens to be selected on the page underneath it, same reasoning
  // as PlayerDetailOverlay (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");

  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Price stays live regardless of mode — matching every other page's
  // identity cluster (Teams, Team Building, the player profile header).
  const livePlayersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const squad = useMemo(() => {
    if (!team) return [];
    return resolvedPlayers
      .filter((p) => p.teamId === team.id)
      .sort((a, b) => {
        if (a.totalPoints === null) return 1;
        if (b.totalPoints === null) return -1;
        return b.totalPoints - a.totalPoints;
      });
  }, [resolvedPlayers, team]);

  const squadTotals = useMemo(() => {
    const sum = (values: (number | null)[]): number | null => {
      const nonNull = values.filter((v): v is number => v !== null);
      if (nonNull.length === 0) return null;
      return nonNull.reduce((a, b) => a + b, 0);
    };
    return {
      points: sum(squad.map((p) => p.totalPoints)),
      goals: sum(squad.map((p) => p.goals)),
      assists: sum(squad.map((p) => p.assists)),
      xG: sum(squad.map((p) => p.xG)),
      xA: sum(squad.map((p) => p.xA)),
      xGI: sum(squad.map((p) => p.xGI)),
      cleanSheets: sum(squad.map((p) => p.cleanSheets)),
    };
  }, [squad]);

  const upcomingFixtures = useMemo(() => (team ? getUpcomingFixtures(team.id, fixtures, teamsById) : []), [team, fixtures, teamsById]);

  if (!team) return null;

  function close() {
    setTeamId(null);
  }

  /** Swaps this overlay for the player profile rather than stacking both — same single-overlay-at-a-time UX as every other cross-link into a player (Dashboard, Teams, etc.). */
  function openPlayer(playerId: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("teamProfile");
      next.set("player", String(playerId));
      return next;
    });
  }

  return (
    <div className="profile-backdrop">
      <div className="profile-sheet">
        <button className="profile-close" onClick={close} type="button" title="Close" aria-label="Close">
          <CloseIcon />
        </button>

        <div className="profile-header">
          <div>
            <h2 style={{ marginBottom: 2 }}>{team.name}</h2>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              {team.position !== null ? `${team.position}${team.position === 1 ? "st" : team.position === 2 ? "nd" : team.position === 3 ? "rd" : "th"} in table · ` : ""}
              {team.points} pts · {team.played} played · {team.wins}W {team.draws}D {team.losses}L
            </p>
          </div>
          <div className="profile-header-actions">
            <Link className="profile-icon-btn" to={`/players?team=${team.id}`} title={`See ${team.name}'s players, sortable by any metric, in Player Explorer`}>
              Player Rankings
            </Link>
          </div>
        </div>

        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

        <div className="profile-section">
          <div className="profile-section-heading">
            <h3>Squad Overview</h3>
          </div>
          <div className="profile-columns">
            <div className="card">
              <div className="card-title">Squad Totals</div>
              <div className="stat-tile-grid">
                <StatTile label="Points" value={fmtDecimal(squadTotals.points, 0)} />
                <StatTile label="Goals" value={fmtDecimal(squadTotals.goals, 0)} />
                <StatTile label="Assists" value={fmtDecimal(squadTotals.assists, 0)} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xG" value={fmtDecimal(squadTotals.xG, 2)} />
                <StatTile label="xA" value={fmtDecimal(squadTotals.xA, 2)} />
                <StatTile label="xGI" value={fmtDecimal(squadTotals.xGI, 2)} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="Clean Sheets" value={fmtDecimal(squadTotals.cleanSheets, 0)} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Upcoming Fixtures</div>
              {upcomingFixtures.length === 0 ? (
                <p className="page-subtitle" style={{ margin: 0 }}>
                  No fixtures scheduled.
                </p>
              ) : (
                <FixtureChips fixtures={upcomingFixtures} />
              )}
            </div>
          </div>
        </div>

        <hr className="profile-divider" />

        <div className="profile-section">
          <div className="profile-section-heading">
            <h3>Squad</h3>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Player</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((player) => (
                    <tr key={player.id} onClick={() => openPlayer(player.id)}>
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
                      <td>{player.totalPoints !== null ? fmtDecimal(player.totalPoints, 0) : DASH}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
