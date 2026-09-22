import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, averageFixtureDifficulty } from "../metrics/fixtureTicker";
import { computePositionPercentiles } from "../metrics/percentiles";
import { computeTeamAggregates, computeTeamRadarData, TEAM_DEFENSE_AXES, TEAM_OFFENSE_AXES, type TeamAggregate } from "../metrics/teamStats";
import { computeSquadSeasonHistory, computeSquadSeasonAverage } from "../metrics/teamSeasonHistory";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { nextSeasonName } from "../metrics/historicAnalysis";
import { relativeCellTint, percentileTint } from "../utils/colorScale";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, FixtureChips } from "./primitives";
import { PercentileRadarChart } from "./PlayerRadarChart";
import { CareerHistoryChart } from "./playerProfile/CareerHistoryChart";
import { fmtDecimal, fmtPrice, fmtSigned, DASH } from "../utils/format";
import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";

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

/** Label-above-value tile — same visual language as the player profile's StatTile. `tint` is a pre-computed CSS colour (from relativeCellTint, comparing this team against every other team) rather than a percentile, since the range here is a simple league-wide min/max, not a within-position percentile. */
function StatTile({ label, value, tint }: { label: string; value: React.ReactNode; tint?: string }) {
  return (
    <div className="stat-tile" style={tint ? { background: tint } : undefined}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

export function TeamDetailOverlay() {
  const {
    players,
    teams,
    teamsById,
    fixtures,
    historicProfiles,
    currentSeasonHasStarted,
    historicReferenceSeason,
    historicStatus,
    allTimeSeasonsByPlayerId,
    requestHistoricData,
  } = useAppState();
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

  // Comparative colouring needs the full team pool, never just this squad
  // — same <percentile_population> rule the rest of the app follows for
  // players. Shared computeTeamAggregates (metrics/teamStats.ts) also
  // backs the new Team Radar section below.
  const allTeamAggregates = useMemo(() => computeTeamAggregates(teams, resolvedPlayers, fixtures), [teams, resolvedPlayers, fixtures]);
  const squadTotals: TeamAggregate | null = useMemo(
    () => (team ? (allTeamAggregates.find((t) => t.teamId === team.id) ?? null) : null),
    [allTeamAggregates, team],
  );

  // Full squad membership, independent of analysisMode (who's on the
  // team doesn't change with the toggle, only their stats do) — drives
  // the Squad Points History chart, which (like the player profile's own
  // Career History) always shows real full-career figures regardless of
  // the mode toggle above.
  const squadPlayerIds = useMemo(() => (team ? players.filter((p) => p.teamId === team.id).map((p) => p.id) : []), [players, team]);

  const squadSeasonHistory = useMemo(() => computeSquadSeasonHistory(squadPlayerIds, allTimeSeasonsByPlayerId), [squadPlayerIds, allTimeSeasonsByPlayerId]);
  const squadSeasonAverage = useMemo(() => computeSquadSeasonAverage(squadSeasonHistory), [squadSeasonHistory]);
  const squadSeasonTrend = useMemo(() => computeSeasonTrend(squadSeasonHistory), [squadSeasonHistory]);

  // Always the live/raw season total, never resolved-mode-dependent —
  // same reasoning PlayerDetailOverlay's own currentSeasonEntry uses raw
  // player.totalPoints rather than a resolved figure: the "(live)" bar on
  // this chart shows today's actual number regardless of which analysis
  // mode the toggle above is set to.
  const liveSquadPoints = useMemo(() => (team ? players.filter((p) => p.teamId === team.id).reduce((acc, p) => acc + (p.totalPoints ?? 0), 0) : 0), [players, team]);
  const currentSquadSeasonEntry = useMemo(
    () => (historicReferenceSeason ? { seasonName: nextSeasonName(historicReferenceSeason), totalPoints: liveSquadPoints } : null),
    [historicReferenceSeason, liveSquadPoints],
  );
  const combinedSquadSeasonHistory = currentSquadSeasonEntry ? [...squadSeasonHistory, currentSquadSeasonEntry] : squadSeasonHistory;
  const squadSeasonNames = useMemo(() => new Set(squadSeasonHistory.map((s) => s.seasonName)), [squadSeasonHistory]);

  const squadTotalRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    const keys: (keyof TeamAggregate)[] = ["points", "goals", "assists", "xG", "xA", "xGI", "cleanSheets"];
    for (const key of keys) {
      const values = allTeamAggregates.map((t) => t[key]).filter((v): v is number => typeof v === "number");
      if (values.length > 0) ranges.set(key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [allTeamAggregates]);

  function totalsTint(key: keyof TeamAggregate): string | undefined {
    const range = squadTotalRanges.get(key);
    const v = squadTotals?.[key];
    if (!range || typeof v !== "number") return undefined;
    return relativeCellTint(v, range.min, range.max, true);
  }

  const upcomingFixtures = useMemo(() => (team ? getUpcomingFixtures(team.id, fixtures, teamsById) : []), [team, fixtures, teamsById]);

  // Average upcoming-fixture difficulty, for every team, so this team's own
  // average can be tinted relative to the whole league — lower average
  // difficulty is easier, hence "better" (higherIsBetter: false below).
  const avgFdrRange = useMemo(() => {
    const values = teams
      .map((t) => averageFixtureDifficulty(getUpcomingFixtures(t.id, fixtures, teamsById)))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [teams, fixtures, teamsById]);

  const avgFdrTint = useMemo(() => {
    const avg = averageFixtureDifficulty(upcomingFixtures);
    if (avg === null || !avgFdrRange) return undefined;
    return relativeCellTint(avg, avgFdrRange.min, avgFdrRange.max, false);
  }, [upcomingFixtures, avgFdrRange]);

  // Per-player comparative colouring for the Squad Summary table — same
  // within-position percentile population/threshold PlayerDetailOverlay
  // uses for its own stat tiles (never squad-filtered — see
  // <percentile_population>).
  const minMinutes = effectiveMinMinutes(DEFAULT_FILTERS, analysisMode);
  const squadPercentiles = useMemo(() => {
    const metrics: Record<string, { fn: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean }> = {
      totalPoints: { fn: (p) => p.totalPoints, higherIsBetter: true },
      xGI: { fn: (p) => p.xGI, higherIsBetter: true },
      xGC: { fn: (p) => p.xGC, higherIsBetter: false },
      defensiveContributions: { fn: (p) => p.defensiveContributions, higherIsBetter: true },
    };
    const result = new Map<string, Map<number, number | null>>();
    for (const [key, { fn, higherIsBetter }] of Object.entries(metrics)) {
      const raw = computePositionPercentiles(resolvedPlayers, fn, minMinutes);
      const flipped = new Map<number, number | null>();
      for (const [playerId, percentile] of raw) flipped.set(playerId, percentile === null ? null : higherIsBetter ? percentile : 100 - percentile);
      result.set(key, flipped);
    }
    return result;
  }, [resolvedPlayers, minMinutes]);

  function squadCellTint(playerId: number, key: string): string | undefined {
    return percentileTint(squadPercentiles.get(key)?.get(playerId) ?? null);
  }

  const teamRadarGroups = useMemo(() => {
    if (!squadTotals) return [];
    return [
      { label: "Defense", data: computeTeamRadarData(TEAM_DEFENSE_AXES, squadTotals, allTeamAggregates) },
      { label: "Offense", data: computeTeamRadarData(TEAM_OFFENSE_AXES, squadTotals, allTeamAggregates) },
    ];
  }, [squadTotals, allTeamAggregates]);

  if (!team || !squadTotals) return null;

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
            <h3>Views</h3>
          </div>
          <div className="profile-columns">
            <div className="card">
              <div className="card-title">Squad Totals</div>
              <div className="stat-tile-grid">
                <StatTile label="Points" value={fmtDecimal(squadTotals.points, 0)} tint={totalsTint("points")} />
                <StatTile label="Goals" value={fmtDecimal(squadTotals.goals, 0)} tint={totalsTint("goals")} />
                <StatTile label="Assists" value={fmtDecimal(squadTotals.assists, 0)} tint={totalsTint("assists")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xG" value={fmtDecimal(squadTotals.xG, 2)} tint={totalsTint("xG")} />
                <StatTile label="xA" value={fmtDecimal(squadTotals.xA, 2)} tint={totalsTint("xA")} />
                <StatTile label="xGI" value={fmtDecimal(squadTotals.xGI, 2)} tint={totalsTint("xGI")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="Clean Sheets" value={fmtDecimal(squadTotals.cleanSheets, 0)} tint={totalsTint("cleanSheets")} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Upcoming Fixtures</div>
              {upcomingFixtures.length === 0 ? (
                <p className="page-subtitle" style={{ margin: 0 }}>
                  No fixtures scheduled.
                </p>
              ) : (
                <FixtureChips fixtures={upcomingFixtures} avgTint={avgFdrTint} />
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Squad Points History</div>
            {historicStatus === "loading" && combinedSquadSeasonHistory.length === 0 ? (
              <p className="page-subtitle">Loading squad points history…</p>
            ) : squadSeasonHistory.length === 0 && !currentSquadSeasonEntry ? (
              <p className="page-subtitle">No season data for the current squad.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  {squadSeasonTrend.direction !== "unknown" && (
                    <span
                      className={`num ${squadSeasonTrend.direction === "up" ? "value-positive" : squadSeasonTrend.direction === "down" ? "value-negative" : "value-muted"}`}
                      style={{ fontSize: 12.5 }}
                    >
                      {squadSeasonTrend.direction === "up" ? "▲" : squadSeasonTrend.direction === "down" ? "▼" : "≈"} {fmtSigned(squadSeasonTrend.pointsDelta, 0)} pts,{" "}
                      {squadSeasonTrend.previousSeason} → {squadSeasonTrend.latestSeason}
                    </span>
                  )}
                </div>

                <CareerHistoryChart
                  seasons={combinedSquadSeasonHistory}
                  countedSeasonNames={squadSeasonNames}
                  currentSeasonName={currentSquadSeasonEntry?.seasonName ?? null}
                  averagePoints={squadSeasonAverage}
                />

                <div className="stat-row" style={{ marginTop: 10 }}>
                  <span className="stat-row-name">Season average ({squadSeasonHistory.length} season{squadSeasonHistory.length === 1 ? "" : "s"})</span>
                  <span className="stat-row-value">{squadSeasonAverage !== null ? `${fmtDecimal(squadSeasonAverage, 0)} pts` : DASH}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <hr className="profile-divider" />

        <div className="profile-section">
          <div className="card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Player</th>
                    <th>Points</th>
                    <th>xGI</th>
                    <th>xGC</th>
                    <th>DC</th>
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
                      <td style={{ backgroundColor: squadCellTint(player.id, "totalPoints") }}>
                        {player.totalPoints !== null ? fmtDecimal(player.totalPoints, 0) : DASH}
                      </td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "xGI") }}>{fmtDecimal(player.xGI, 2)}</td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "xGC") }}>{fmtDecimal(player.xGC, 2)}</td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "defensiveContributions") }}>{fmtDecimal(player.defensiveContributions, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-heading">
            <h3>Team Radar</h3>
          </div>
          <div className="profile-columns">
            {teamRadarGroups.map((group) => (
              <div className="card" key={group.label}>
                <div className="card-title">Team Radar — {group.label}</div>
                <PercentileRadarChart data={group.data} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
