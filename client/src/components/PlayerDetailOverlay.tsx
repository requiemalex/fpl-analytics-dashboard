import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { usePlayerHistory } from "../state/usePlayerHistory";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computePositionPercentiles } from "../metrics/percentiles";
import { computeArchetypesForAllPlayers } from "../metrics/archetypes";
import { computeRadarData } from "../metrics/radarStats";
import { PlayerRadarChart } from "./PlayerRadarChart";
import { computePlayingTimeIndicators } from "../metrics/rotationIndicators";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { buildHistoricPlayerProfile, nextSeasonName } from "../metrics/historicAnalysis";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode } from "../metrics/resolvePlayerStats";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { PositionBadge, SignedNum, PercentileBar, ArchetypeBadges } from "./primitives";
import { fmtDecimal, fmtPrice, fmtPercent, fmtSigned, DASH } from "../utils/format";
import type { NormalizedPlayer, PlayerSeasonHistory } from "../types/normalized";

function useSelectedPlayer(): [NormalizedPlayer | null, (id: number | null) => void] {
  const { players } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get("player");
  const player = id ? (players.find((p) => p.id === Number(id)) ?? null) : null;

  const setId = (newId: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newId === null) next.delete("player");
      else next.set("player", String(newId));
      return next;
    });
  };

  return [player, setId];
}

function StatBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-row">
      <span className="stat-row-name">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  );
}

export function PlayerDetailOverlay() {
  const { players, teamsById, filters, historicReferenceSeason, historicStatus, analysisMode, historicProfiles, currentSeasonHasStarted } =
    useAppState();
  const [player, setPlayerId] = useSelectedPlayer();

  const history = usePlayerHistory(player?.id ?? null);

  // The live season, shaped like a PlayerSeasonHistory entry so it can slot
  // straight into the same career-history table/average/qualifying logic
  // as prior seasons — sourced from the raw live player (never null in
  // practice), matching how the rest of the app treats live data. Needs
  // historicReferenceSeason (the last COMPLETED season) to name itself, so
  // it's absent until that's loaded at least once.
  const currentSeasonEntry: PlayerSeasonHistory | null = useMemo(() => {
    if (!player || !historicReferenceSeason) return null;
    return {
      seasonName: nextSeasonName(historicReferenceSeason),
      totalPoints: player.totalPoints ?? 0,
      minutes: player.minutes ?? 0,
      starts: player.starts,
      goals: player.goals ?? 0,
      assists: player.assists ?? 0,
      cleanSheets: player.cleanSheets ?? 0,
      bonus: player.bonus ?? 0,
      bps: player.bps ?? 0,
      ictIndex: player.ictIndex,
      startCost: player.price,
      endCost: player.price,
      xG: player.xG,
      xA: player.xA,
      xGI: player.xGI,
      xGC: player.xGC,
      defensiveContribution: player.defensiveContributions,
    };
  }, [player, historicReferenceSeason]);

  const combinedSeasonHistory = currentSeasonEntry ? [...history.seasonHistory, currentSeasonEntry] : history.seasonHistory;

  // Archetypes/percentiles are computed against the same resolved-mode
  // population every other page uses, not the raw live list — otherwise
  // this page would silently disagree with Player Explorer about who
  // counts as a "High-upside Attacker" whenever a historic mode is active.
  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Deliberately keyed on filters.minMinutes, not the whole filters object —
  // it's the only field effectiveMinMinutes actually reads, and filters gets
  // a new reference on every keystroke elsewhere (e.g. the underlying page's
  // FiltersBar), which would otherwise bust these memos and rerun a full
  // population percentile/archetype scan on every unrelated keystroke while
  // this overlay happens to be open.
  const xGIPercentiles = useMemo(
    () => computePositionPercentiles(resolvedPlayers, (p) => p.xGIPer90, effectiveMinMinutes(filters, analysisMode)),
    [resolvedPlayers, filters.minMinutes, analysisMode],
  );

  const archetypeMap = useMemo(
    () => computeArchetypesForAllPlayers(resolvedPlayers, effectiveMinMinutes(filters, analysisMode), teamsById, historicProfiles, players),
    [resolvedPlayers, filters.minMinutes, analysisMode, teamsById, historicProfiles, players],
  );

  // Hooks must run before the early return below, so this recomputes its own
  // resolved player rather than reusing the `resolvedPlayer` const further
  // down (cheap — a single-player transform) to memoize the genuinely
  // expensive part: computeRadarData's 6 full-population percentile scans.
  const radarData = useMemo(() => {
    if (!player) return [];
    const resolved = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
    return computeRadarData(resolved, resolvedPlayers, effectiveMinMinutes(filters, analysisMode));
  }, [player, analysisMode, historicProfiles, currentSeasonHasStarted, resolvedPlayers, filters.minMinutes]);

  if (!player) return null;

  // The stat cards below use this — identity fields (name, team, position,
  // price/ownership in the header, Career History, Playing-Time
  // Indicators, the Compare link) all stay on the live `player` throughout,
  // matching how every other page keeps identity live and only resolves
  // the performance figures.
  const resolvedPlayer = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
  const derived = getPlayerDerivedMetrics(resolvedPlayer);
  const archetypes = archetypeMap.get(player.id) ?? [];
  const percentile = xGIPercentiles.get(player.id) ?? null;
  // <live_vs_resolved_bug>: this used to check `player.minutes` (the
  // LIVE player's current-season minutes) even when viewing Last
  // Completed Season or Historic Average — so a player with a full,
  // well-sampled historic record but low CURRENT-season minutes (true
  // of nearly everyone pre-season or early in a new season) was wrongly
  // flagged as a small sample for modes where their data was actually
  // robust. Now checks the RESOLVED player's minutes — whichever the
  // active mode actually resolved to — against the same threshold. Null
  // minutes (no data at all for this mode, see resolvePlayerStats.ts)
  // counts as small-sample too — there's nothing to build a reliable
  // radar/percentile from either way.
  const smallSample =
    analysisMode !== "live" &&
    (resolvedPlayer.minutes === null || resolvedPlayer.minutes < effectiveMinMinutes(filters, analysisMode));

  function close() {
    setPlayerId(null);
  }

  return (
    <div className="overlay-backdrop" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="btn drawer-close" onClick={close} type="button">
          Close
        </button>

        <h2 style={{ marginBottom: 2 }}>{player.name}</h2>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          <PositionBadge position={player.position} /> &nbsp;{player.teamName} · {fmtPrice(player.price)} · {fmtPercent(player.ownership)} owned
        </p>
        {player.status !== "a" && player.news && <div className="banner stale">{player.news}</div>}

        <AnalysisModeToggle />

        {smallSample && !hasDataForMode(resolvedPlayer) && (
          <div className="banner info" style={{ marginTop: 16 }}>
            No data for {player.name} in this mode — every field below shows {DASH}. Try Last Completed Season or Historic Average.
            Career History and Playing-Time Indicators below are unaffected.
          </div>
        )}
        <div className="card-grid" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-title">Actual Output</div>
              <StatBlock label="Total Points" value={fmtDecimal(resolvedPlayer.totalPoints)} />
              <StatBlock label="PPG" value={fmtDecimal(resolvedPlayer.pointsPerGame, 1)} />
              <StatBlock label="Minutes" value={fmtDecimal(resolvedPlayer.minutes)} />
              <StatBlock label="Starts" value={fmtDecimal(resolvedPlayer.starts)} />
              <StatBlock label="Goals" value={fmtDecimal(resolvedPlayer.goals)} />
              <StatBlock label="Assists" value={fmtDecimal(resolvedPlayer.assists)} />
              <StatBlock label="Clean Sheets" value={fmtDecimal(resolvedPlayer.cleanSheets)} />
              <StatBlock label="Bonus" value={fmtDecimal(resolvedPlayer.bonus)} />
              <StatBlock label="BPS" value={fmtDecimal(resolvedPlayer.bps)} />
              <StatBlock label="ICT Index" value={fmtDecimal(resolvedPlayer.ictIndex, 1)} />
            </div>

            <div className="card">
              <div className="card-title">Underlying Performance</div>
              <StatBlock label="xG" value={fmtDecimal(resolvedPlayer.xG, 2)} />
              <StatBlock label="xA" value={fmtDecimal(resolvedPlayer.xA, 2)} />
              <StatBlock label="xGI" value={fmtDecimal(resolvedPlayer.xGI, 2)} />
              <StatBlock label="xGC" value={fmtDecimal(resolvedPlayer.xGC, 2)} />
              <StatBlock label="xG/90" value={fmtDecimal(resolvedPlayer.xGPer90, 2)} />
              <StatBlock label="xA/90" value={fmtDecimal(resolvedPlayer.xAPer90, 2)} />
              <StatBlock label="xGI/90" value={fmtDecimal(resolvedPlayer.xGIPer90, 2)} />
              <StatBlock label="xGC/90" value={fmtDecimal(resolvedPlayer.xGCPer90, 2)} />
              <StatBlock label="Defensive Contributions" value={fmtDecimal(resolvedPlayer.defensiveContributions)} />
              <StatBlock label="DC/90" value={fmtDecimal(resolvedPlayer.defensiveContributionsPer90, 2)} />
            </div>

            <div className="card">
              <div className="card-title">Value</div>
              <StatBlock label="Points/£m" value={fmtDecimal(derived.pointsPerMillion, 1)} />
              <StatBlock label="Points/90" value={fmtDecimal(derived.pointsPer90, 1)} />
              <StatBlock label="Minutes/Point" value={fmtDecimal(derived.minutesPerPoint, 0)} />
              <StatBlock label="Minutes/Goal" value={fmtDecimal(derived.minutesPerGoal, 0)} />
              <StatBlock label="Minutes/Assist" value={fmtDecimal(derived.minutesPerAssist, 0)} />
            </div>

            <div className="card">
              <div className="card-title">
                Position Percentile — xGI/90 {smallSample && <span style={{ color: "var(--accent-value)" }}>(below eligibility threshold)</span>}
              </div>
              <PercentileBar percentile={smallSample ? null : percentile} />
              <div style={{ marginTop: 10 }}>
                <ArchetypeBadges labels={archetypes} />
              </div>
            </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Actual vs Expected</div>
            {smallSample && <div className="banner info">Small sample — below the current minutes eligibility threshold ({filters.minMinutes} min). Read with caution.</div>}
            <StatBlock label="Goals − xG" value={<SignedNum value={derived.goalsMinusXG} />} />
            <StatBlock label="Assists − xA" value={<SignedNum value={derived.assistsMinusXA} />} />
            <StatBlock label="Goal Involvements − xGI" value={<SignedNum value={derived.goalInvolvementsMinusXGI} />} />
        </div>

        <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">
              Percentile Radar — {player.position}
              {smallSample && <span style={{ color: "var(--accent-value)" }}> (below eligibility threshold)</span>}
            </div>
            <PlayerRadarChart data={smallSample ? radarData.map((d) => ({ ...d, percentile: null })) : radarData} />
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Playing-Time Indicators (descriptive, not predictive)</div>
          {history.status === "loading" && <p className="page-subtitle">Loading gameweek history…</p>}
          {history.status === "error" && <p className="page-subtitle">Couldn't load gameweek history: {history.errorMessage}</p>}
          {history.status === "ready" &&
            (() => {
              const ind = computePlayingTimeIndicators(history.history);
              return (
                <>
                  <StatBlock label={`Starts % (last ${ind.windowSize} GWs)`} value={ind.startsPercentage !== null ? fmtPercent(ind.startsPercentage, 0) : DASH} />
                  <StatBlock label="Average Minutes" value={fmtDecimal(ind.averageMinutes, 0)} />
                  <StatBlock
                    label="Substitute Appearance Frequency"
                    value={ind.substituteAppearanceFrequency !== null ? fmtPercent(ind.substituteAppearanceFrequency, 0) : DASH}
                  />
                  <StatBlock label="Recent Minutes" value={fmtDecimal(ind.recentMinutes)} />
                </>
              );
            })()}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Career History</div>
          {history.status === "loading" && <p className="page-subtitle">Loading career history…</p>}
          {history.status === "error" && (
            <p className="page-subtitle">
              Couldn't load career history: {history.errorMessage}{" "}
              <button type="button" className="chip" onClick={history.retry} style={{ marginLeft: 4 }}>
                Retry
              </button>
            </p>
          )}
          {history.status === "ready" && combinedSeasonHistory.length === 0 && (
            <p className="page-subtitle">No season data — {player.name} doesn't appear in the FPL API before this season.</p>
          )}
          {history.status === "ready" && combinedSeasonHistory.length > 0 && historicStatus === "loading" && (
            <p className="page-subtitle">Determining the qualifying-average window (uses the same historic dataset as the rest of the app)…</p>
          )}
          {history.status === "ready" &&
            combinedSeasonHistory.length > 0 &&
            historicStatus !== "loading" &&
            (() => {
              const { qualifyingSeasons, qualifyingAverage } = buildHistoricPlayerProfile(combinedSeasonHistory, historicReferenceSeason);
              const qualifyingSeasonNames = new Set(qualifyingSeasons.map((s) => s.seasonName));
              const trend = computeSeasonTrend(history.seasonHistory);
              return (
                <>
                  <div className="table-wrap">
                    <table className="data-table compact">
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", cursor: "default" }}>Season</th>
                          <th>Price</th>
                          <th>Mins</th>
                          <th>Starts</th>
                          <th>Points</th>
                          <th>Goals</th>
                          <th>Assists</th>
                          <th>CS</th>
                          <th>xG</th>
                          <th>xA</th>
                          <th>xGI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combinedSeasonHistory.map((s) => {
                          const qualifies = qualifyingSeasonNames.has(s.seasonName);
                          const isCurrentSeason = s.seasonName === currentSeasonEntry?.seasonName;
                          return (
                            <tr key={s.seasonName} style={qualifies ? undefined : { color: "var(--text-muted)" }} title={qualifies ? undefined : "Outside the qualifying window or below the minutes threshold — excluded from the career average below"}>
                              <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                                {s.seasonName}
                                {isCurrentSeason ? " (live)" : !qualifies && " *"}
                              </td>
                              <td>
                                {isCurrentSeason
                                  ? fmtPrice(s.endCost)
                                  : s.startCost !== null && s.endCost !== null
                                    ? `${fmtPrice(s.startCost)}–${fmtPrice(s.endCost)}`
                                    : DASH}
                              </td>
                              <td>{fmtDecimal(s.minutes)}</td>
                              <td>{s.starts !== null ? fmtDecimal(s.starts) : DASH}</td>
                              <td>{fmtDecimal(s.totalPoints)}</td>
                              <td>{fmtDecimal(s.goals)}</td>
                              <td>{fmtDecimal(s.assists)}</td>
                              <td>{fmtDecimal(s.cleanSheets)}</td>
                              <td>{fmtDecimal(s.xG, 2)}</td>
                              <td>{fmtDecimal(s.xA, 2)}</td>
                              <td>{fmtDecimal(s.xGI, 2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="stat-row" style={{ marginTop: 10 }}>
                    <span className="stat-row-name">
                      Qualifying average ({qualifyingAverage?.seasonsPlayed ?? 0} season{qualifyingAverage?.seasonsPlayed === 1 ? "" : "s"})
                    </span>
                    <span className="stat-row-value">
                      {qualifyingAverage ? (
                        <>
                          {fmtDecimal(qualifyingAverage.avgPointsPerSeason, 0)} pts · {fmtDecimal(qualifyingAverage.avgMinutesPerSeason, 0)} mins ·{" "}
                          {fmtDecimal(qualifyingAverage.avgGoalsPerSeason, 1)} G · {fmtDecimal(qualifyingAverage.avgAssistsPerSeason, 1)} A
                        </>
                      ) : (
                        DASH
                      )}
                    </span>
                  </div>

                  {trend.direction !== "unknown" && (
                    <div className="stat-row">
                      <span className="stat-row-name">
                        Trend ({trend.previousSeason} → {trend.latestSeason})
                      </span>
                      <span
                        className={`stat-row-value ${trend.direction === "up" ? "value-positive" : trend.direction === "down" ? "value-negative" : "value-muted"}`}
                      >
                        {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "≈"} {fmtSigned(trend.pointsDelta, 0)} pts
                      </span>
                    </div>
                  )}

                  <p className="page-subtitle" style={{ marginTop: 8 }}>
                    Seasons marked * (or (live), for the season in progress) fall outside the qualifying window or minutes bar and
                    aren't counted in the average above — the table itself still shows every season on record.
                  </p>
                </>
              );
            })()}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Compare</div>
          <Link className="btn" to={`/player-comparison?players=${player.id}`}>
            Compare {player.name}
          </Link>
        </div>
      </div>
    </div>
  );
}
