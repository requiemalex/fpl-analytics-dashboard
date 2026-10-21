import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { useDialogFocus } from "../state/useDialogFocus";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures } from "../metrics/fixtureTicker";
import { teamColumnByKey, teamColumnForMode } from "./teamColumns";
import { countDecimals } from "./playerColumns";
import {
  computeTeamAggregates,
  computeTeamRadarData,
  clubLiveMatches,
  clubRecordsForMode,
  clubSeasonHistory,
  clubSeasonsForMode,
  TEAM_DEFENSE_AXES,
  TEAM_OFFENSE_AXES,
  type TeamAggregate,
} from "../metrics/teamStats";
import { computeClubSeasonWindow } from "../metrics/teamSeasonHistory";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { percentileTint } from "../utils/colorScale";
import { clubRankHint } from "./hoverText";
import { clubRanks, fixtureDifficultyRanks, rankAmong } from "../metrics/comparativeColour";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { FixtureChips, withCoverage } from "./primitives";
import { partialAverage, partialTotal, sumKnown, type PartialSum } from "../metrics/partialTotals";
import { PercentileRadarChart } from "./PlayerRadarChart";
import { AverageLineIcon, PointsHistoryChart, PointsHistoryHeader, PointsHistoryStats } from "./playerProfile/PointsHistory";
import { fmtDecimal, fmtOrdinal, DASH } from "../utils/format";
import { useExternalStats, type ProfileView } from "../extensions/externalStats";
import { SourceToggle } from "./SourceToggle";
import { CloseIcon } from "./IconToolbar";
import type { ClubMatch, NormalizedTeam } from "../types/normalized";

/**
 * The header's league line for the Data View, from the club's figures for
 * it, each shown as Team Explorer's column shows it (a Historic Average
 * rounds the same way). A club with no record for the view (not in the
 * Premier League that season) shows "—". It used to show today's table in
 * every Data View (audit 2026-09-25 player-team-profiles M1).
 */
export function teamHeaderLine(t: TeamAggregate, mode: AnalysisMode): string {
  if (t.leaguePosition === null && t.leaguePoints === null && t.played === null) return DASH;
  const show = (key: string, v: number | null) => {
    const c = teamColumnByKey(key);
    return c ? teamColumnForMode(c, mode).format(v) : DASH;
  };
  const position = t.leaguePosition === null ? DASH : fmtOrdinal(Number(show("leaguePosition", t.leaguePosition)));
  return `${position} in table · ${show("leaguePoints", t.leaguePoints)} pts · ${show("played", t.played)} played · ${show("wins", t.wins)}W ${show("draws", t.draws)}D ${show("losses", t.losses)}L`;
}

/** The club `?teamProfile=` names, and whether it names one that doesn't exist (an old link, or not a number) — shown as a message rather than silently ignored. */
function useSelectedTeam(): [NormalizedTeam | null, (id: number | null) => void, boolean] {
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

  return [team, setId, id !== null && team === null];
}

function matchResult(m: ClubMatch): { label: string; outcomeClass: string } {
  const label = `${m.goalsFor}–${m.goalsAgainst}`;
  if (m.goalsFor > m.goalsAgainst) return { label, outcomeClass: "value-positive" };
  if (m.goalsFor < m.goalsAgainst) return { label, outcomeClass: "value-negative" };
  return { label, outcomeClass: "value-muted" };
}

/**
 * The match log's stat columns (<club_match_log>) — the team counterparts
 * of the player gameweek log's. Goals are the club's own players' (the
 * partner for xG); the Result column has the score.
 */
const MATCH_LOG_COLUMNS: { key: string; header: string; decimals: number; higherIsBetter: boolean; value: (m: ClubMatch) => number | null }[] = [
  { key: "pts", header: "FPL Points", decimals: 0, higherIsBetter: true, value: (m) => m.fantasyPoints },
  { key: "g", header: "Goals", decimals: 0, higherIsBetter: true, value: (m) => m.goals },
  { key: "a", header: "Assists", decimals: 0, higherIsBetter: true, value: (m) => m.assists },
  { key: "xg", header: "xG", decimals: 2, higherIsBetter: true, value: (m) => m.xG },
  { key: "xa", header: "xA", decimals: 2, higherIsBetter: true, value: (m) => m.xA },
  { key: "xgi", header: "xGI", decimals: 2, higherIsBetter: true, value: (m) => m.xGI },
  { key: "cs", header: "Clean Sheets", decimals: 0, higherIsBetter: true, value: (m) => (m.goalsAgainst === 0 ? 1 : 0) },
  { key: "xgc", header: "xGC", decimals: 2, higherIsBetter: false, value: (m) => m.xGC },
  { key: "dc", header: "Defensive Contributions", decimals: 0, higherIsBetter: true, value: (m) => m.dc },
];

/** A column's Totals and Average over the matches (<partial_totals>): those with a figure added up, a match without one left out; null if none has one. */
export function matchLogSum(matches: ClubMatch[], value: (m: ClubMatch) => number | null): PartialSum | null {
  return sumKnown(matches.map(value));
}

/** Label-above-value tile — same visual language as the player profile's StatTile. `tint` is its comparative colour: the club ranked among every club (<comparative_colouring>). */
function StatTile({ label, value, tint, title }: { label: string; value: React.ReactNode; tint?: string; title?: string }) {
  return (
    <div className="stat-tile" style={tint ? { background: tint } : undefined} title={title}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

export function TeamDetailOverlay() {
  const { teams, teamsById, fixtures, clubSeasons, currentSeasonHasStarted, historicReferenceSeason, historicStatus, historicFetchSkippedPlayerIds, requestHistoricData } = useAppState();
  const [team, setTeamId, unknownTeamLink] = useSelectedTeam();
  const isOpen = team !== null;
  // Every club figure here (Current Season included) comes from the historic
  // dataset, but only an open profile needs it: this overlay is mounted on
  // every page (audit 2026-09-25 player-team-profiles M3).
  useEffect(() => {
    if (isOpen) requestHistoricData();
  }, [isOpen, requestHistoricData]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // The profile's own analysis-mode — deliberately independent of whatever
  // mode happens to be selected on the page underneath it, same reasoning
  // as PlayerDetailOverlay (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");

  const clubCtx = useMemo(
    () => ({ clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted, livePlayerSumsPartial: historicFetchSkippedPlayerIds.length > 0 }),
    [clubSeasons, historicReferenceSeason, currentSeasonHasStarted, historicFetchSkippedPlayerIds],
  );

  // Every club's figures for this view — comparative colouring and the
  // radar need the whole league, never just this club (same
  // <percentile_population> rule the rest of the app follows for players).
  const allTeamAggregates = useMemo(() => computeTeamAggregates(teams, analysisMode, clubCtx), [teams, analysisMode, clubCtx]);
  const clubTotals: TeamAggregate | null = useMemo(
    () => (team ? (allTeamAggregates.find((t) => t.teamId === team.id) ?? null) : null),
    [allTeamAggregates, team],
  );

  // The Match Log's season (<club_match_log>): the live one, unless a
  // season has been picked on Points History — tied to the club, so the
  // next one opens on live.
  const liveSeasonName = clubSeasonsForMode("live", historicReferenceSeason)[0] ?? null;
  const [pickedSeason, setPickedSeason] = useState<{ teamId: number; season: string } | null>(null);
  // Match Log columns switched to the second source's figure with their ⇄ toggle — FPL for each club opened.
  const [switchedLog, setSwitchedLog] = useState<{ teamId: number; keys: string[] } | null>(null);
  const pastLogSeason = pickedSeason && pickedSeason.teamId === team?.id && pickedSeason.season !== liveSeasonName ? pickedSeason.season : null;
  const logSeason = pastLogSeason ?? liveSeasonName;

  // Every club's matches in that season, so the shown club's Totals and
  // Average rows are tinted against the league's that season.
  const matchesByCode = useMemo(() => {
    const out = new Map<number, ClubMatch[]>();
    if (pastLogSeason === null) {
      for (const t of teams) if (t.code !== null) out.set(t.code, clubLiveMatches(t.code, clubCtx));
    } else {
      for (const c of clubSeasons) {
        if (c.season === pastLogSeason) out.set(c.code, [...c.matches].sort((a, b) => (b.event ?? 0) - (a.event ?? 0) || b.fixture - a.fixture));
      }
    }
    return out;
  }, [pastLogSeason, teams, clubSeasons, clubCtx]);
  const logMatches = team?.code != null ? (matchesByCode.get(team.code) ?? []) : [];
  // Opponents by club code, as they were named that season (a club since relegated isn't in today's list).
  const shortNameByCode = useMemo(() => {
    const names = new Map<number, string>();
    for (const t of teams) if (t.code !== null) names.set(t.code, t.shortName);
    if (pastLogSeason !== null) for (const c of clubSeasons) if (c.season === pastLogSeason) names.set(c.code, c.shortName);
    return names;
  }, [teams, clubSeasons, pastLogSeason]);
  // The Totals and Average rows' colours (<comparative_colouring>): the
  // club's figure ranked among every other club's for the same season —
  // Average as each club's total ÷ its own matches.
  const matchLogPools = useMemo(() => {
    const pools = new Map<string, { total: number[]; average: number[] }>();
    for (const c of MATCH_LOG_COLUMNS) {
      const total: number[] = [];
      const average: number[] = [];
      for (const [code, ms] of matchesByCode) {
        if (code === team?.code) continue;
        const s = matchLogSum(ms, c.value);
        if (s === null) continue;
        total.push(partialTotal(s)!);
        average.push(partialAverage(s)!);
      }
      pools.set(c.key, { total, average });
    }
    return pools;
  }, [matchesByCode, team?.code]);

  function matchLogTint(key: string, kind: "total" | "average", v: number | null, higherIsBetter: boolean): string | undefined {
    return percentileTint(rankAmong(v, matchLogPools.get(key)?.[kind] ?? [], higherIsBetter));
  }

  // FPL points per season for this club, every season on record (live
  // included) — each bar is what the club's players scored FOR IT that
  // season, so a season before the club was in the Premier League simply
  // isn't there.
  const seasonHistory = useMemo(() => clubSeasonHistory(team?.code ?? null, clubSeasons, clubCtx.livePlayerSumsPartial), [team, clubSeasons, clubCtx]);
  const completedSeasonHistory = useMemo(() => seasonHistory.filter((s) => s.complete), [seasonHistory]);
  // Same 4-season rolling window (HISTORIC_WINDOW_SEASONS) the player
  // profile's own Points History average uses — a season outside it
  // draws muted-grey on the chart, same treatment as there.
  const { inWindowNames: windowSeasonNames, windowAverage: seasonAverage } = useMemo(
    () => computeClubSeasonWindow(completedSeasonHistory, historicReferenceSeason),
    [completedSeasonHistory, historicReferenceSeason],
  );
  const seasonTrend = useMemo(() => computeSeasonTrend(completedSeasonHistory), [completedSeasonHistory]);

  // Season Totals' colours: the club ranked among every club for this Data View.
  // Its hover says the place: "4th of 20 clubs" (<hover_text>).
  function totalsShade(key: keyof TeamAggregate, higherIsBetter = true): { tint?: string; title?: string } {
    if (!clubTotals) return {};
    const value = (t: TeamAggregate) => (typeof t[key] === "number" ? (t[key] as number) : null);
    const ranks = clubRanks(allTeamAggregates, { id: (t) => t.teamId, value, higherIsBetter });
    const rank = ranks.get(clubTotals.teamId);
    return { tint: percentileTint(rank), title: clubRankHint(rank, ranks.size) };
  }

  const upcomingFixtures = useMemo(() => (team ? getUpcomingFixtures(team.id, fixtures, teamsById) : []), [team, fixtures, teamsById]);

  // Average upcoming-fixture difficulty ranked among every club's — easier is better.
  const fixtureRanks = useMemo(() => fixtureDifficultyRanks(new Map(teams.map((t) => [t.id, getUpcomingFixtures(t.id, fixtures, teamsById)]))), [teams, fixtures, teamsById]);
  const avgFdrTint = team ? percentileTint(fixtureRanks.get(team.id)) : undefined;

  // A second source's cards follow the Data View over the seasons the
  // club's own figures use: those it was in the league (clubRecordsForMode).
  // Null while the historic dataset is still loading.
  const external = useExternalStats();
  const teamCode = team?.code ?? null;
  const externalView: ProfileView = useMemo(() => {
    if (historicReferenceSeason === null) return { mode: analysisMode, seasons: historicStatus === "error" ? [] : null };
    return { mode: analysisMode, seasons: clubRecordsForMode(teamCode, analysisMode, clubCtx).map((c) => c.season) };
  }, [analysisMode, historicReferenceSeason, historicStatus, teamCode, clubCtx]);
  useEffect(() => {
    if (!external || teamCode === null) return;
    const wanted = new Set([...(externalView.seasons ?? []), ...(logSeason ? [logSeason] : [])]);
    if (wanted.size > 0) external.profiles.requestClub(teamCode, [...wanted]);
  }, [external, teamCode, externalView, logSeason]);

  const teamRadarGroups = useMemo(() => {
    if (!clubTotals) return [];
    return [
      { label: "Defense", data: computeTeamRadarData(TEAM_DEFENSE_AXES, clubTotals, allTeamAggregates) },
      { label: "Offense", data: computeTeamRadarData(TEAM_OFFENSE_AXES, clubTotals, allTeamAggregates) },
    ];
  }, [clubTotals, allTeamAggregates]);

  // Escape closes the profile, like its × button — only this layer when
  // something opened before it is still open (audit 2026-09-25
  // player-team-profiles M5).
  useEscapeLayer(isOpen || unknownTeamLink, () => setTeamId(null));
  useDialogFocus(isOpen || unknownTeamLink, sheetRef);

  function close() {
    setTeamId(null);
  }

  if (unknownTeamLink) {
    return (
      <div className="profile-backdrop">
        <div className="profile-sheet" ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <button className="profile-close" onClick={close} type="button" title="Close" aria-label="Close">
            <CloseIcon />
          </button>
          <h2 id={headingId}>Team not found</h2>
          <p className="page-subtitle">This link is to a club that isn't in FPL's current list of teams.</p>
        </div>
      </div>
    );
  }

  if (!team || !clubTotals) return null;

  // A second source's columns for the shown season (Understat: each match's result chances).
  const logFixtures = logMatches.map((m) => m.fixture);
  const externalColumns = external && team.code !== null && logSeason !== null ? external.profiles.clubMatchColumns(team.code, logSeason, logFixtures) : [];
  // A figure both sources have (Assists, xG, xA, xGI, xGC) gets a ⇄ toggle
  // on its header; switched, the whole column is the second source's — each
  // match, Totals and Average, and their colours ranked on that source's
  // figures — <one_source_per_figure>.
  const alternates = external && team.code !== null && logSeason !== null ? external.profiles.clubMatchAlternates(team.code, logSeason, logFixtures) : {};
  const switchedKeys = new Set(switchedLog && switchedLog.teamId === team.id ? switchedLog.keys : []);
  const switchedAlternate = (key: string) => (switchedKeys.has(key) ? (alternates[key] ?? null) : null);
  function toggleLogSource(key: string) {
    const next = new Set(switchedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSwitchedLog({ teamId: team!.id, keys: [...next] });
  }

  return (
    <div className="profile-backdrop">
      <div className="profile-sheet" ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <button className="profile-close" onClick={close} type="button" title="Close" aria-label="Close">
          <CloseIcon />
        </button>

        <div className="profile-header">
          <div>
            <h2 id={headingId} style={{ marginBottom: 2 }}>{team.name}</h2>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              {teamHeaderLine(clubTotals, analysisMode)}
            </p>
          </div>
        </div>

        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} clubFigures />

        <div className="profile-section">
          <div className="profile-section-heading col-source-fpl">
            <h3>FPL · Views</h3>
          </div>
          {/* Two rows: the radars, then Season Totals beside Upcoming Fixtures. */}
          <div className="profile-grid">
            {teamRadarGroups.map((group) => (
              <div className="card" key={group.label}>
                <div className="card-title">Team Radar · {group.label}</div>
                <PercentileRadarChart data={group.data} />
              </div>
            ))}

            <div className="card">
              <div className="card-title">Season Totals</div>
              <div className="stat-tile-grid">
                <StatTile label="FPL Points" value={fmtDecimal(clubTotals.points, countDecimals(analysisMode))} {...totalsShade("points")} />
                <StatTile label="Goals" value={fmtDecimal(clubTotals.goals, countDecimals(analysisMode))} {...totalsShade("goals")} />
                <StatTile label="Assists" value={fmtDecimal(clubTotals.assists, countDecimals(analysisMode))} {...totalsShade("assists")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xG" value={fmtDecimal(clubTotals.xG, 2)} {...totalsShade("xG")} />
                <StatTile label="xA" value={fmtDecimal(clubTotals.xA, 2)} {...totalsShade("xA")} />
                <StatTile label="xGI" value={fmtDecimal(clubTotals.xGI, 2)} {...totalsShade("xGI")} />
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <StatTile label="xGC" value={fmtDecimal(clubTotals.xGC, 2)} {...totalsShade("xGC", false)} />
                <StatTile label="Clean Sheets" value={fmtDecimal(clubTotals.cleanSheets, countDecimals(analysisMode))} {...totalsShade("cleanSheets")} />
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

        {external && team.code !== null && (
          <div className="profile-section">
            <div className={`profile-section-heading ${external.className}`}>
              <h3>{external.label} · Views</h3>
            </div>
            <div className="profile-grid">{external.profiles.clubCards(team.code, externalView)}</div>
          </div>
        )}

        <hr className="profile-divider" />

        {/* This season's formations, whatever the Data View — the club's set-up now, not its past ones (owner's decision, 2026-10-21). */}
        {external && team.code !== null && liveSeasonName && (
          <div className="profile-section">
            <div className={`profile-section-heading match-log-head ${external.className}`}>
              <h3>{external.label} · Formations</h3>
              <span className="match-log-season">{liveSeasonName} (current season)</span>
            </div>
            {external.profiles.clubFormations(team.code, liveSeasonName)}
          </div>
        )}

        <div className="profile-section">
          <PointsHistoryHeader
            title="FPL · Points History"
            className="col-source-fpl"
            trend={seasonHistory.length > 0 ? seasonTrend : null}
            titleHint={`FPL points scored for ${team.name} each season, by whoever played for them then`}
          />
          <div className="card">
            {historicStatus === "loading" && seasonHistory.length === 0 ? (
              <p className="page-subtitle">Loading club history…</p>
            ) : seasonHistory.length === 0 ? (
              <p className="page-subtitle">No season data for {team.name}.</p>
            ) : (
              <>
                <PointsHistoryChart
                  seasons={seasonHistory}
                  countedSeasonNames={windowSeasonNames}
                  currentSeasonName={liveSeasonName}
                  averagePoints={seasonAverage}
                  selectedSeasonName={logSeason}
                  onSelectSeason={(season) => setPickedSeason({ teamId: team.id, season })}
                />
                <PointsHistoryStats
                  items={[
                    {
                      icon: <AverageLineIcon />,
                      value: fmtDecimal(seasonAverage, 0),
                      label: `Season average over ${windowSeasonNames.size} season${windowSeasonNames.size === 1 ? "" : "s"}: ${fmtDecimal(seasonAverage, 0)} pts`,
                    },
                  ]}
                />
              </>
            )}
          </div>
        </div>

        <div className="profile-section">
          <div className={`profile-section-heading match-log-head ${externalColumns.length > 0 ? "col-source-crossover" : "col-source-fpl"}`}>
            <h3>{externalColumns.length > 0 && external ? `FPL & ${external.label}` : "FPL"} · Match Log</h3>
            <span className="match-log-season">{pastLogSeason ?? (liveSeasonName ? `${liveSeasonName} (current season)` : "This season")}</span>
          </div>
          <div className="card">
            {historicStatus === "loading" && logMatches.length === 0 ? (
              <p className="page-subtitle">Loading match log…</p>
            ) : logMatches.length === 0 ? (
              <p className="page-subtitle">{pastLogSeason === null ? "No matches played yet this season." : `No matches for ${team.name} in ${pastLogSeason}.`}</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table compact" aria-label={`${team.name} match log`}>
                  <thead>
                    <tr>
                      <th className="col-source-fpl" style={{ textAlign: "left" }}>
                        GW
                      </th>
                      <th className="col-source-fpl" style={{ textAlign: "left" }}>
                        Opponent
                      </th>
                      <th className="col-source-fpl" style={{ textAlign: "left" }}>
                        Result
                      </th>
                      {MATCH_LOG_COLUMNS.map((c, i) => {
                        const switched = switchedAlternate(c.key) !== null;
                        return (
                          <th key={c.key} className={[i === 0 ? "column-group-divider" : "", switched ? (external?.className ?? "") : "col-source-fpl"].join(" ").trim()}>
                            {c.header}
                            {alternates[c.key] && external && <SourceToggle showingExternal={switched} externalLabel={external.label} onToggle={() => toggleLogSource(c.key)} />}
                          </th>
                        );
                      })}
                      {externalColumns.map((c, i) => (
                        <th key={c.key} className={[i === 0 ? "column-group-divider" : "", external?.className ?? ""].join(" ").trim()} title={c.title}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logMatches.map((m) => {
                      const result = matchResult(m);
                      return (
                        <tr key={m.fixture}>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{m.event ?? DASH}</td>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                            {shortNameByCode.get(m.opponentCode) ?? DASH} <span className="team">({m.home ? "H" : "A"})</span>
                          </td>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                            <span className={result.outcomeClass}>{result.label}</span>
                          </td>
                          {MATCH_LOG_COLUMNS.map((c, i) => (
                            <td key={c.key} className={i === 0 ? "column-group-divider" : undefined}>
                              {switchedAlternate(c.key)?.cell(m.fixture) ?? fmtDecimal(c.value(m), c.decimals)}
                            </td>
                          ))}
                          {externalColumns.map((c, i) => (
                            <td key={c.key} className={i === 0 ? "column-group-divider" : undefined}>
                              {c.cell(m.fixture)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-footer">
                    <tr style={{ fontWeight: 600 }}>
                      <td className="table-footer-label" colSpan={3}>
                        Totals
                      </td>
                      {MATCH_LOG_COLUMNS.map((c, i) => {
                        const alt = switchedAlternate(c.key);
                        const sum = matchLogSum(logMatches, c.value);
                        const total = partialTotal(sum);
                        return (
                          <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: alt ? alt.totalTint : matchLogTint(c.key, "total", total, c.higherIsBetter) }}>
                            {alt ? alt.total : withCoverage(fmtDecimal(total, c.decimals), sum)}
                          </td>
                        );
                      })}
                      {externalColumns.map((c, i) => (
                        <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={c.totalTint ? { background: c.totalTint } : undefined}>
                          {c.total ?? ""}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="table-footer-label" colSpan={3}>
                        Average
                      </td>
                      {MATCH_LOG_COLUMNS.map((c, i) => {
                        const alt = switchedAlternate(c.key);
                        const sum = matchLogSum(logMatches, c.value);
                        const average = partialAverage(sum);
                        return (
                          <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: alt ? alt.averageTint : matchLogTint(c.key, "average", average, c.higherIsBetter) }}>
                            {alt ? alt.average : withCoverage(fmtDecimal(average, 2), sum)}
                          </td>
                        );
                      })}
                      {externalColumns.map((c, i) => (
                        <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={c.averageTint ? { background: c.averageTint } : undefined}>
                          {c.average ?? ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
