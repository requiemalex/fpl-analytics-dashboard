import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, averageFixtureDifficulty } from "../metrics/fixtureTicker";
import { computePositionPercentiles } from "../metrics/percentiles";
import {
  computeTeamAggregates,
  computeTeamRadarData,
  clubPlayerFigures,
  clubSeasonHistory,
  TEAM_DEFENSE_AXES,
  TEAM_OFFENSE_AXES,
  type ClubPlayerFigures,
  type TeamAggregate,
} from "../metrics/teamStats";
import { computeClubSeasonWindow } from "../metrics/teamSeasonHistory";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { relativeCellTint, percentileTint } from "../utils/colorScale";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, FixtureChips, Tooltip } from "./primitives";
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
  const { players, teams, teamsById, fixtures, clubSeasons, currentSeasonHasStarted, historicReferenceSeason, historicStatus, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [team, setTeamId] = useSelectedTeam();
  const [, setSearchParams] = useSearchParams();
  // The profile's own analysis-mode — deliberately independent of whatever
  // mode happens to be selected on the page underneath it, same reasoning
  // as PlayerDetailOverlay (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");

  const clubCtx = useMemo(
    () => ({ clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted }),
    [clubSeasons, historicReferenceSeason, currentSeasonHasStarted],
  );

  // Every club's figures for this view — comparative colouring and the
  // radar need the whole league, never just this club (same
  // <percentile_population> rule the rest of the app follows for players).
  const allTeamAggregates = useMemo(() => computeTeamAggregates(teams, analysisMode, clubCtx), [teams, analysisMode, clubCtx]);
  const clubTotals: TeamAggregate | null = useMemo(
    () => (team ? (allTeamAggregates.find((t) => t.teamId === team.id) ?? null) : null),
    [allTeamAggregates, team],
  );

  // Each current player's figures FOR HIS CURRENT CLUB in this view, for
  // every club — the roster table below reads this club's, and the
  // percentile tints compare against everyone's. A summer signing has no
  // figures for last season here: what he did elsewhere is player
  // analysis, not this club's (see <club_not_squad>, metrics/teamStats.ts).
  const figuresByTeamId = useMemo(() => {
    const map = new Map<number, Map<number, ClubPlayerFigures>>();
    for (const t of teams) map.set(t.id, clubPlayerFigures(t.code, analysisMode, clubCtx));
    return map;
  }, [teams, analysisMode, clubCtx]);

  const figuresFor = (p: NormalizedPlayer): ClubPlayerFigures | null => (p.code === null ? null : (figuresByTeamId.get(p.teamId)?.get(p.code) ?? null));

  const squad = useMemo(() => {
    if (!team) return [];
    return players
      .filter((p) => p.teamId === team.id)
      .map((p) => ({ player: p, figures: figuresFor(p) }))
      .sort((a, b) => {
        if (a.figures === null) return b.figures === null ? 0 : 1;
        if (b.figures === null) return -1;
        return b.figures.totalPoints - a.figures.totalPoints;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, team, figuresByTeamId]);

  // FPL points per season for this club, every season on record (live
  // included) — each bar is what the club's players scored FOR IT that
  // season, so a season before the club was in the Premier League simply
  // isn't there.
  const seasonHistory = useMemo(() => clubSeasonHistory(team?.code ?? null, clubSeasons), [team, clubSeasons]);
  const completedSeasonHistory = useMemo(() => seasonHistory.filter((s) => s.complete), [seasonHistory]);
  const liveSeasonName = seasonHistory.find((s) => !s.complete)?.seasonName ?? null;
  // Same 4-season rolling window (HISTORIC_WINDOW_SEASONS) the player
  // profile's own Career History average uses — a season outside it
  // draws muted-grey on the chart, same treatment as there.
  const { inWindowNames: windowSeasonNames, windowAverage: seasonAverage } = useMemo(
    () => computeClubSeasonWindow(completedSeasonHistory, historicReferenceSeason),
    [completedSeasonHistory, historicReferenceSeason],
  );
  const seasonTrend = useMemo(() => computeSeasonTrend(completedSeasonHistory), [completedSeasonHistory]);

  const totalRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    const keys: (keyof TeamAggregate)[] = ["points", "goals", "assists", "xG", "xA", "xGI", "xGC", "cleanSheets"];
    for (const key of keys) {
      const values = allTeamAggregates.map((t) => t[key]).filter((v): v is number => typeof v === "number");
      if (values.length > 0) ranges.set(key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [allTeamAggregates]);

  function totalsTint(key: keyof TeamAggregate, higherIsBetter = true): string | undefined {
    const range = totalRanges.get(key);
    const v = clubTotals?.[key];
    if (!range || typeof v !== "number") return undefined;
    return relativeCellTint(v, range.min, range.max, higherIsBetter);
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

  // Per-player comparative colouring for the roster table — the same
  // within-position percentile/threshold PlayerDetailOverlay uses, over
  // every current player's figures for his own club in this view (never
  // squad-filtered — see <percentile_population>).
  const minMinutes = effectiveMinMinutes(DEFAULT_FILTERS, analysisMode);
  const squadPercentiles = useMemo(() => {
    const population: NormalizedPlayer[] = [];
    for (const p of players) {
      const f = figuresFor(p);
      if (!f) continue;
      population.push({ ...p, minutes: f.minutes, totalPoints: f.totalPoints, xGI: f.xGI, xGC: f.xGC, defensiveContributions: f.dc });
    }
    const metrics: Record<string, { fn: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean }> = {
      totalPoints: { fn: (p) => p.totalPoints, higherIsBetter: true },
      xGI: { fn: (p) => p.xGI, higherIsBetter: true },
      xGC: { fn: (p) => p.xGC, higherIsBetter: false },
      defensiveContributions: { fn: (p) => p.defensiveContributions, higherIsBetter: true },
    };
    const result = new Map<string, Map<number, number | null>>();
    for (const [key, { fn, higherIsBetter }] of Object.entries(metrics)) {
      const raw = computePositionPercentiles(population, fn, minMinutes);
      const flipped = new Map<number, number | null>();
      for (const [playerId, percentile] of raw) flipped.set(playerId, percentile === null ? null : higherIsBetter ? percentile : 100 - percentile);
      result.set(key, flipped);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, figuresByTeamId, minMinutes]);

  function squadCellTint(playerId: number, key: string): string | undefined {
    return percentileTint(squadPercentiles.get(key)?.get(playerId) ?? null);
  }

  const teamRadarGroups = useMemo(() => {
    if (!clubTotals) return [];
    return [
      { label: "Defense", data: computeTeamRadarData(TEAM_DEFENSE_AXES, clubTotals, allTeamAggregates) },
      { label: "Offense", data: computeTeamRadarData(TEAM_OFFENSE_AXES, clubTotals, allTeamAggregates) },
    ];
  }, [clubTotals, allTeamAggregates]);

  if (!team || !clubTotals) return null;

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
            {teamRadarGroups.map((group) => (
              <div className="card" key={group.label}>
                <div className="card-title">Team Radar — {group.label}</div>
                <PercentileRadarChart data={group.data} />
              </div>
            ))}

            <div className="card">
              <div className="card-title">Season Totals</div>
              <div className="stat-tile-grid">
                <StatTile label="FPL Points" value={fmtDecimal(clubTotals.points, 0)} tint={totalsTint("points")} />
                <StatTile label="Goals" value={fmtDecimal(clubTotals.goals, 0)} tint={totalsTint("goals")} />
                <StatTile label="Assists" value={fmtDecimal(clubTotals.assists, 0)} tint={totalsTint("assists")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xG" value={fmtDecimal(clubTotals.xG, 2)} tint={totalsTint("xG")} />
                <StatTile label="xA" value={fmtDecimal(clubTotals.xA, 2)} tint={totalsTint("xA")} />
                <StatTile label="xGI" value={fmtDecimal(clubTotals.xGI, 2)} tint={totalsTint("xGI")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xGC" value={fmtDecimal(clubTotals.xGC, 2)} tint={totalsTint("xGC", false)} />
                <StatTile label="Clean Sheets" value={fmtDecimal(clubTotals.cleanSheets, 0)} tint={totalsTint("cleanSheets")} />
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
                  {squad.map(({ player, figures }) => (
                    <tr key={player.id} onClick={() => openPlayer(player.id)}>
                      <td className="sticky-col">
                        <div className="player-name-cell">
                          <span className={`name ${availabilityTextClass(player.status)}`}>
                            {player.name}
                            <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
                          </span>
                          <span className="meta">
                            <PositionBadge position={player.position} /> {fmtPrice(player.price)}
                          </span>
                        </div>
                      </td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "totalPoints") }}>{figures ? fmtDecimal(figures.totalPoints, 0) : DASH}</td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "xGI") }}>{fmtDecimal(figures?.xGI ?? null, 2)}</td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "xGC") }}>{fmtDecimal(figures?.xGC ?? null, 2)}</td>
                      <td style={{ backgroundColor: squadCellTint(player.id, "defensiveContributions") }}>{fmtDecimal(figures?.dc ?? null, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <hr className="profile-divider" />

        <div className="profile-section">
          <div className="card">
            <div className="card-title">FPL Points History</div>
            {historicStatus === "loading" && seasonHistory.length === 0 ? (
              <p className="page-subtitle">Loading club history…</p>
            ) : seasonHistory.length === 0 ? (
              <p className="page-subtitle">No season data for {team.name}.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  {seasonTrend.direction !== "unknown" && (
                    <span
                      className={`num ${seasonTrend.direction === "up" ? "value-positive" : seasonTrend.direction === "down" ? "value-negative" : "value-muted"}`}
                      style={{ fontSize: 12.5 }}
                    >
                      {seasonTrend.direction === "up" ? "▲" : seasonTrend.direction === "down" ? "▼" : "≈"} {fmtSigned(seasonTrend.pointsDelta, 0)} pts,{" "}
                      {seasonTrend.previousSeason} → {seasonTrend.latestSeason}
                    </span>
                  )}
                </div>

                <CareerHistoryChart seasons={seasonHistory} countedSeasonNames={windowSeasonNames} currentSeasonName={liveSeasonName} averagePoints={seasonAverage} />

                <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    <Tooltip label="?">
                      Each bar is the FPL points scored for {team.name} that season by whoever was playing for the club then — not the current squad.
                      Seasons {team.name} weren&apos;t in the Premier League don&apos;t appear.
                    </Tooltip>
                  </span>
                </div>

                <div className="stat-row" style={{ marginTop: 10 }}>
                  <span className="stat-row-name">
                    Season average ({windowSeasonNames.size} season{windowSeasonNames.size === 1 ? "" : "s"})
                  </span>
                  <span className="stat-row-value">{seasonAverage !== null ? `${fmtDecimal(seasonAverage, 0)} pts` : DASH}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
