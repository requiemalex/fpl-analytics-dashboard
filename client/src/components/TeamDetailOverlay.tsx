import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { useDialogFocus } from "../state/useDialogFocus";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, averageFixtureDifficulty } from "../metrics/fixtureTicker";
import { teamColumnByKey } from "./teamColumns";
import {
  computeTeamAggregates,
  computeTeamRadarData,
  clubLiveMatches,
  clubSeasonHistory,
  TEAM_DEFENSE_AXES,
  TEAM_OFFENSE_AXES,
  type TeamAggregate,
} from "../metrics/teamStats";
import { computeClubSeasonWindow } from "../metrics/teamSeasonHistory";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { relativeCellTint } from "../utils/colorScale";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { FixtureChips } from "./primitives";
import { PercentileRadarChart } from "./PlayerRadarChart";
import { AverageLineIcon, PointsHistoryChart, PointsHistoryHeader, PointsHistoryStats } from "./playerProfile/PointsHistory";
import { fmtDecimal, fmtOrdinal, DASH } from "../utils/format";
import type { ClubMatch, NormalizedTeam } from "../types/normalized";

/**
 * The header's league line for the Data View, from the club's figures for
 * it, each shown as Team Explorer's column shows it (a Historic Average
 * rounds the same way). A club with no record for the view (not in the
 * Premier League that season) shows "—". It used to show today's table in
 * every Data View (audit 2026-09-25 player-team-profiles M1).
 */
export function teamHeaderLine(t: TeamAggregate): string {
  if (t.leaguePosition === null && t.leaguePoints === null && t.played === null) return DASH;
  const show = (key: string, v: number | null) => teamColumnByKey(key)?.format(v) ?? DASH;
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

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
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

/** A column summed over the matches — null if any match lacks it (never a partial sum) or there are none. */
export function matchLogTotal(matches: ClubMatch[], value: (m: ClubMatch) => number | null): number | null {
  if (matches.length === 0) return null;
  let total = 0;
  for (const m of matches) {
    const v = value(m);
    if (v === null) return null;
    total += v;
  }
  return total;
}

type TintRange = { min: number; max: number } | null;

function valueRange(values: (number | null)[]): TintRange {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : { min: Math.min(...present), max: Math.max(...present) };
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
  const { teams, teamsById, fixtures, clubSeasons, currentSeasonHasStarted, historicReferenceSeason, historicStatus, requestHistoricData } = useAppState();
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

  // The club's own live-season match log (<club_match_log>), and every
  // club's, so its Totals and Average rows are tinted against the league's.
  const liveMatchesByTeamId = useMemo(() => new Map(teams.map((t) => [t.id, clubLiveMatches(t.code, clubCtx)])), [teams, clubCtx]);
  const liveMatches = team ? (liveMatchesByTeamId.get(team.id) ?? []) : [];
  const matchLogRanges = useMemo(() => {
    const ranges = new Map<string, { total: TintRange; average: TintRange }>();
    for (const c of MATCH_LOG_COLUMNS) {
      const clubs = [...liveMatchesByTeamId.values()].map((ms) => ({ total: matchLogTotal(ms, c.value), n: ms.length }));
      ranges.set(c.key, {
        total: valueRange(clubs.map((x) => x.total)),
        average: valueRange(clubs.map((x) => (x.total === null ? null : x.total / x.n))),
      });
    }
    return ranges;
  }, [liveMatchesByTeamId]);

  function matchLogTint(key: string, kind: "total" | "average", v: number | null, higherIsBetter: boolean): string | undefined {
    const range = matchLogRanges.get(key)?.[kind];
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, higherIsBetter);
  }

  // FPL points per season for this club, every season on record (live
  // included) — each bar is what the club's players scored FOR IT that
  // season, so a season before the club was in the Premier League simply
  // isn't there.
  const seasonHistory = useMemo(() => clubSeasonHistory(team?.code ?? null, clubSeasons), [team, clubSeasons]);
  const completedSeasonHistory = useMemo(() => seasonHistory.filter((s) => s.complete), [seasonHistory]);
  const liveSeasonName = seasonHistory.find((s) => !s.complete)?.seasonName ?? null;
  // Same 4-season rolling window (HISTORIC_WINDOW_SEASONS) the player
  // profile's own Points History average uses — a season outside it
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
              {teamHeaderLine(clubTotals)}
            </p>
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
          <div className="profile-section-heading">
            <h3>Live Data</h3>
          </div>
          <div className="card">
            {historicStatus === "loading" && liveMatches.length === 0 ? (
              <p className="page-subtitle">Loading match log…</p>
            ) : liveMatches.length === 0 ? (
              <p className="page-subtitle">No matches played yet this season.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table compact" aria-label={`${team.name} match log`}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>GW</th>
                      <th style={{ textAlign: "left" }}>Opponent</th>
                      <th style={{ textAlign: "left" }}>Result</th>
                      {MATCH_LOG_COLUMNS.map((c, i) => (
                        <th key={c.key} className={i === 0 ? "column-group-divider" : undefined}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveMatches.map((m) => {
                      const opponent = teams.find((t) => t.code === m.opponentCode);
                      const result = matchResult(m);
                      return (
                        <tr key={m.fixture}>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{m.event ?? DASH}</td>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                            {opponent?.shortName ?? DASH} <span className="team">({m.home ? "H" : "A"})</span>
                          </td>
                          <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                            <span className={result.outcomeClass}>{result.label}</span>
                          </td>
                          {MATCH_LOG_COLUMNS.map((c, i) => (
                            <td key={c.key} className={i === 0 ? "column-group-divider" : undefined}>
                              {fmtDecimal(c.value(m), c.decimals)}
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
                        const total = matchLogTotal(liveMatches, c.value);
                        return (
                          <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: matchLogTint(c.key, "total", total, c.higherIsBetter) }}>
                            {fmtDecimal(total, c.decimals)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="table-footer-label" colSpan={3}>
                        Average
                      </td>
                      {MATCH_LOG_COLUMNS.map((c, i) => {
                        const total = matchLogTotal(liveMatches, c.value);
                        const average = total === null ? null : total / liveMatches.length;
                        return (
                          <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: matchLogTint(c.key, "average", average, c.higherIsBetter) }}>
                            {fmtDecimal(average, 2)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <hr className="profile-divider" />

        <div className="profile-section">
          <PointsHistoryHeader
            trend={seasonHistory.length > 0 ? seasonTrend : null}
            titleHint={`Each bar is the FPL points scored for ${team.name} that season by whoever was playing for the club then — not the current squad. Seasons ${team.name} weren't in the Premier League don't appear.`}
          />
          <div className="card">
            {historicStatus === "loading" && seasonHistory.length === 0 ? (
              <p className="page-subtitle">Loading club history…</p>
            ) : seasonHistory.length === 0 ? (
              <p className="page-subtitle">No season data for {team.name}.</p>
            ) : (
              <>
                <PointsHistoryChart seasons={seasonHistory} countedSeasonNames={windowSeasonNames} currentSeasonName={liveSeasonName} averagePoints={seasonAverage} />
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
      </div>
    </div>
  );
}
