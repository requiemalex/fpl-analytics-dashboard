import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { usePlayerHistory } from "../state/usePlayerHistory";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computeRadarDataForAxes, getRadarAxisGroupsForPosition } from "../metrics/radarStats";
import { computePositionPercentiles } from "../metrics/percentiles";
import { percentileTint, relativeCellTint } from "../utils/colorScale";
import { PercentileRadarChart } from "./PlayerRadarChart";
import { ActualVsExpectedBars } from "./playerProfile/ActualVsExpectedBars";
import { CareerHistoryChart } from "./playerProfile/CareerHistoryChart";
import { PlayingTimeIcon } from "./playerProfile/PlayingTimeIcon";
import { computeSeasonAverageMinutes, computeGameweekTotals, computeGameweekAverages } from "../metrics/rotationIndicators";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { buildHistoricPlayerProfile, nextSeasonName, HISTORIC_WINDOW_SEASONS } from "../metrics/historicAnalysis";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { AnalysisModeToggle } from "./AnalysisModeToggle";
import { PositionBadge } from "./primitives";
import { fmtDecimal, fmtPrice, fmtPercent, fmtSigned, DASH } from "../utils/format";
import type { NormalizedPlayer, PlayerSeasonHistory, PlayerGameweekHistory } from "../types/normalized";

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

/** Label-above-value, not label-beside-value — a side-by-side stat-row
 * only has room to breathe in a full-width card; this is for the narrow
 * multi-column grids (Underlying Numbers, Value) where that would
 * otherwise visually collide (e.g. "xG/Game" and "0.78" running together). */
/** `percentile` is this player's within-position percentile for whatever stat `value` shows (already flipped so higher = better) — omitted (or null) shows no tint, e.g. for a small-sample player computePositionPercentiles has nothing to place them against. */
function StatTile({ label, value, percentile }: { label: string; value: React.ReactNode; percentile?: number | null }) {
  const tint = percentileTint(percentile ?? null);
  return (
    <div className="stat-tile" style={tint ? { background: tint } : undefined}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

/** Win/draw/loss from this player's own team's perspective, plus the score written as their-goals–opponent-goals — never assumed from the raw home/away score pair directly, since that already got resolved to teamScore/opponentScore during normalization. */
function gameweekResult(g: PlayerGameweekHistory): { label: string; outcomeClass: string } {
  if (g.teamScore === null || g.opponentScore === null) return { label: DASH, outcomeClass: "value-muted" };
  const label = `${g.teamScore}–${g.opponentScore}`;
  if (g.teamScore > g.opponentScore) return { label, outcomeClass: "value-positive" };
  if (g.teamScore < g.opponentScore) return { label, outcomeClass: "value-negative" };
  return { label, outcomeClass: "value-muted" };
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Two uneven bars — the same bar-chart motif as the app's own icon, reused here for "Compare" since it's visually distinct from every other icon in the header without introducing a new visual language. */
function CompareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="7" width="4" height="7" rx="1" fill="currentColor" />
      <rect x="10" y="3" width="4" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Expand/collapse indicator for the season-by-season detail table — points down when collapsed (click to expand downward), flips to point up once expanded (click to retract). */
function ChevronIcon({ direction }: { direction: "down" | "up" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ transform: direction === "up" ? "rotate(180deg)" : undefined }}>
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayerDetailOverlay() {
  const { players, teamsById, historicReferenceSeason, historicStatus, historicProfiles, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [player, setPlayerId] = useSelectedPlayer();
  const [showFullCareerTable, setShowFullCareerTable] = useState(false);
  // The profile's own analysis-mode — deliberately independent of
  // whatever mode happens to be selected on the page underneath it (see
  // state/scoutingFilters.ts). No Min Minutes control of its own, so
  // `filters` below is a fixed, never-mutated default — purely to
  // satisfy effectiveMinMinutes' signature for the radar's small-sample
  // threshold, not a hidden knob.
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const filters = DEFAULT_FILTERS;

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

  // Percentiles are computed against the same resolved-mode population
  // every other page uses, not the raw live list — otherwise this page
  // would silently disagree with Player Explorer about where a player
  // ranks whenever a historic mode is active.
  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Hooks must run before the early return below, so this recomputes its own
  // resolved player rather than reusing the `resolvedPlayer` const further
  // down (cheap — a single-player transform) to memoize the genuinely
  // expensive part: one full-population percentile scan per axis, across
  // every radar group (one group for GKP/FWD, two — Defense/Offense — for
  // DEF/MID; see getRadarAxisGroupsForPosition).
  const radarGroups = useMemo(() => {
    if (!player) return [];
    const resolved = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
    const minMinutes = effectiveMinMinutes(filters, analysisMode);
    return getRadarAxisGroupsForPosition(player.position).map((group) => ({
      label: group.label,
      data: computeRadarDataForAxes(group.axes, resolved, resolvedPlayers, minMinutes),
    }));
  }, [player, analysisMode, historicProfiles, currentSeasonHasStarted, resolvedPlayers, filters.minMinutes]);

  // Comparative colouring for the Underlying Numbers / Value stat tiles —
  // same green-better/red-worse language as Player Explorer's Comparative
  // Colouring and Player Comparison's cell tints, but relative to this
  // player's within-POSITION percentile (computePositionPercentiles, the
  // same population/threshold the Percentile Radar above already uses)
  // rather than a visible row range, since a single-player card has no
  // "rows on screen" to compare against. A small-sample player (below the
  // minutes threshold) naturally gets `null` back from
  // computePositionPercentiles here — same as the radar already nulling
  // itself out — so no tint is shown rather than a misleading one.
  const statPercentiles = useMemo(() => {
    if (!player) return {} as Record<string, number | null>;
    const minMinutes = effectiveMinMinutes(filters, analysisMode);
    const metrics: Record<string, { fn: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean }> = {
      cleanSheets: { fn: (p) => p.cleanSheets, higherIsBetter: true },
      xGC: { fn: (p) => p.xGC, higherIsBetter: false },
      defensiveContributions: { fn: (p) => p.defensiveContributions, higherIsBetter: true },
      xGCPerGame: { fn: (p) => p.xGCPerGame, higherIsBetter: false },
      defensiveContributionsPerGame: { fn: (p) => p.defensiveContributionsPerGame, higherIsBetter: true },
      bps: { fn: (p) => p.bps, higherIsBetter: true },
      xG: { fn: (p) => p.xG, higherIsBetter: true },
      xA: { fn: (p) => p.xA, higherIsBetter: true },
      xGI: { fn: (p) => p.xGI, higherIsBetter: true },
      xGPerGame: { fn: (p) => p.xGPerGame, higherIsBetter: true },
      xAPerGame: { fn: (p) => p.xAPerGame, higherIsBetter: true },
      xGIPerGame: { fn: (p) => p.xGIPerGame, higherIsBetter: true },
      pointsPerGame: { fn: (p) => p.pointsPerGame, higherIsBetter: true },
      pointsPerMillion: { fn: (p) => getPlayerDerivedMetrics(p).pointsPerMillion, higherIsBetter: true },
      minutesPerGoal: { fn: (p) => getPlayerDerivedMetrics(p).minutesPerGoal, higherIsBetter: false },
    };
    const result: Record<string, number | null> = {};
    for (const [key, { fn, higherIsBetter }] of Object.entries(metrics)) {
      const raw = computePositionPercentiles(resolvedPlayers, fn, minMinutes).get(player.id) ?? null;
      result[key] = raw === null ? null : higherIsBetter ? raw : 100 - raw;
    }
    return result;
  }, [player, resolvedPlayers, analysisMode, filters.minMinutes]);

  // The Current Season Log's Totals/Average rows are always live-season
  // data regardless of the analysis-mode toggle above (see
  // <gw_log_is_always_live> below), so their comparative colouring is
  // always computed against the LIVE population too — never whichever
  // mode happens to be selected elsewhere on the page.
  const liveResolvedPlayers = useMemo(
    () => resolvePlayerStatsList(players, "live", historicProfiles, currentSeasonHasStarted).resolved,
    [players, historicProfiles, currentSeasonHasStarted],
  );

  // Limited to the columns whose season aggregate actually exists on
  // NormalizedPlayer (this app's whole-pool bootstrap data) — tackles,
  // CBI, recoveries, goals conceded, own goals, cards and penalties are
  // only ever computed per-gameweek for the one player currently being
  // viewed (usePlayerHistory is lazy-loaded per player, see CLAUDE.md),
  // so there's no real population to compare those columns against; they
  // stay untinted rather than showing something fabricated. The same
  // percentile is used for both the Totals row and the Average row (both
  // reflect the same underlying season-long standing, just as a sum vs. a
  // per-game rate) rather than maintaining a second, mostly-unavailable
  // per-game population for the Average row specifically.
  const seasonLogPercentiles = useMemo(() => {
    if (!player) return {} as Record<string, number | null>;
    const metrics: Record<string, { fn: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean }> = {
      pts: { fn: (p) => p.totalPoints, higherIsBetter: true },
      min: { fn: (p) => p.minutes, higherIsBetter: true },
      g: { fn: (p) => p.goals, higherIsBetter: true },
      a: { fn: (p) => p.assists, higherIsBetter: true },
      xg: { fn: (p) => p.xG, higherIsBetter: true },
      xa: { fn: (p) => p.xA, higherIsBetter: true },
      xgi: { fn: (p) => p.xGI, higherIsBetter: true },
      cs: { fn: (p) => p.cleanSheets, higherIsBetter: true },
      // Starts deliberately has no entry here — it moved from Prime to
      // Supplements (a less load-bearing metric there) and lost its
      // comparative colouring in the same change; seasonLogPercentiles["st"]
      // is now always undefined, so percentileTint(undefined ?? null)
      // renders no tint for its Totals/Average rows.
      xgc: { fn: (p) => p.xGC, higherIsBetter: false },
      dc: { fn: (p) => p.defensiveContributions, higherIsBetter: true },
      saves: { fn: (p) => p.saves, higherIsBetter: true },
      bps: { fn: (p) => p.bps, higherIsBetter: true },
    };
    const result: Record<string, number | null> = {};
    for (const [key, { fn, higherIsBetter }] of Object.entries(metrics)) {
      const raw = computePositionPercentiles(liveResolvedPlayers, fn, 0).get(player.id) ?? null;
      result[key] = raw === null ? null : higherIsBetter ? raw : 100 - raw;
    }
    return result;
  }, [player, liveResolvedPlayers]);

  if (!player) return null;

  // The stat cards below use this — identity fields (name, team, position,
  // price/ownership in the header, Career History, Playing-Time
  // Indicators, the Compare link) all stay on the live `player` throughout,
  // matching how every other page keeps identity live and only resolves
  // the performance figures.
  const resolvedPlayer = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
  const derived = getPlayerDerivedMetrics(resolvedPlayer);
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

  // DEF and MID score points from both facets — same reasoning as the
  // split Defense/Offense percentile radars (radarGroups.length > 1 for
  // exactly those two positions) — so Underlying Numbers shows both
  // stat blocks for them, rather than picking one facet like GKP/FWD do.

  function close() {
    setPlayerId(null);
  }

  type GwColumn = { key: string; header: string; align?: "left"; cell: (g: PlayerGameweekHistory) => React.ReactNode };

  // <gw_log_is_always_live>: unlike every other figure on this page, a
  // gameweek-by-gameweek breakdown only ever exists for the live season
  // — historic seasons only have season-level totals (see
  // usePlayerHistory / normalizeElementSummary.ts). So this table always
  // shows the real live-season log regardless of the analysis-mode
  // toggle above, and is headed generically rather than naming whichever
  // mode happens to be selected.
  const identityColumns: GwColumn[] = [
    { key: "gw", header: "GW", align: "left", cell: (g) => g.round },
    {
      key: "opp",
      header: "Opponent",
      align: "left",
      cell: (g) => {
        const opponent = teamsById.get(g.opponentTeamId);
        return (
          <>
            {opponent?.shortName ?? "???"} <span className="team">({g.wasHome ? "H" : "A"})</span>
          </>
        );
      },
    },
    {
      key: "res",
      header: "Result",
      cell: (g) => {
        const r = gameweekResult(g);
        return <span className={r.outcomeClass}>{r.label}</span>;
      },
    },
  ];

  // A goalkeeper never records a save or a penalty save while playing
  // outfield — those two columns are structurally GKP-only, so they're
  // hidden entirely rather than shown as an always-zero row for everyone
  // else. Defensive Contributions is the opposite case: the mechanic
  // itself (a per-match action-count threshold) explicitly excludes
  // goalkeepers per official FPL scoring rules — see README's "Defensive
  // Contribution/Game vs Defensive Reward/Game" — so it's hidden for GKP
  // specifically rather than shown as a column that can never score them
  // anything. Every other column here is at least possible for every
  // position (however rare), so nothing else is pruned.
  const isGoalkeeper = player.position === "GKP";

  // Headers spelled close to their full name (space allowing — this table
  // already scrolls horizontally) EXCEPT the handful that are already
  // this app's (and football analytics generally, for xG/xA/xGI/xGC)
  // established short form elsewhere — expanding those here alone would
  // make this table LESS consistent with the rest of the app, not more
  // readable.
  const primeColumns: GwColumn[] = [
    { key: "pts", header: "Points", cell: (g) => fmtDecimal(g.totalPoints) },
    { key: "min", header: "Minutes", cell: (g) => fmtDecimal(g.minutes) },
    { key: "g", header: "Goals", cell: (g) => fmtDecimal(g.goals) },
    { key: "a", header: "Assists", cell: (g) => fmtDecimal(g.assists) },
    { key: "xg", header: "xG", cell: (g) => fmtDecimal(g.xG, 2) },
    { key: "xa", header: "xA", cell: (g) => fmtDecimal(g.xA, 2) },
    { key: "xgi", header: "xGI", cell: (g) => fmtDecimal(g.xGI, 2) },
    { key: "cs", header: "Clean Sheets", cell: (g) => fmtDecimal(g.cleanSheets) },
    { key: "xgc", header: "xGC", cell: (g) => fmtDecimal(g.xGC, 2) },
    ...(isGoalkeeper ? [] : [{ key: "dc", header: "Defensive Contributions", cell: (g: PlayerGameweekHistory) => fmtDecimal(g.defensiveContribution) }]),
    ...(isGoalkeeper ? [{ key: "saves", header: "Saves", cell: (g: PlayerGameweekHistory) => fmtDecimal(g.saves) }] : []),
    { key: "bps", header: "BPS", cell: (g) => fmtDecimal(g.bps) },
  ];

  const supplementsColumns: GwColumn[] = [
    { key: "st", header: "Starts", cell: (g) => (g.starts !== null ? fmtDecimal(g.starts) : DASH) },
    { key: "gc", header: "Goals Conceded", cell: (g) => fmtDecimal(g.goalsConceded) },
    { key: "t", header: "Tackles", cell: (g) => fmtDecimal(g.tackles) },
    { key: "cbi", header: "Clear/Blocks/Int", cell: (g) => fmtDecimal(g.clearancesBlocksInterceptions) },
    { key: "r", header: "Recoveries", cell: (g) => fmtDecimal(g.recoveries) },
    { key: "og", header: "Own Goals", cell: (g) => fmtDecimal(g.ownGoals) },
    ...(isGoalkeeper ? [{ key: "ps", header: "Penalties Saved", cell: (g: PlayerGameweekHistory) => fmtDecimal(g.penaltiesSaved) }] : []),
    { key: "pm", header: "Penalties Missed", cell: (g) => fmtDecimal(g.penaltiesMissed) },
    { key: "yc", header: "Yellow Cards", cell: (g) => fmtDecimal(g.yellowCards) },
    { key: "rc", header: "Red Cards", cell: (g) => fmtDecimal(g.redCards) },
  ];

  // Prime and Supplements each render as their own table (see
  // <live_data_split> below) rather than one wide table — computed once
  // here so both tables' Totals/Average footer rows share the same
  // gameweek list and aggregates.
  const seasonLogRows =
    history.status === "ready" && history.history.length > 0
      ? (() => {
          const gameweeks = [...history.history].sort((a, b) => b.round - a.round);
          const totals = computeGameweekTotals(history.history);
          const averages = computeGameweekAverages(totals);
          const totalsByKey: Record<string, React.ReactNode> = {
            pts: fmtDecimal(totals.points),
            min: fmtDecimal(totals.minutes),
            g: fmtDecimal(totals.goals),
            a: fmtDecimal(totals.assists),
            xg: fmtDecimal(totals.xG, 2),
            xa: fmtDecimal(totals.xA, 2),
            xgi: fmtDecimal(totals.xGI, 2),
            cs: fmtDecimal(totals.cleanSheets),
            st: fmtDecimal(totals.starts),
            gc: fmtDecimal(totals.goalsConceded),
            xgc: fmtDecimal(totals.xGC, 2),
            t: fmtDecimal(totals.tackles),
            cbi: fmtDecimal(totals.clearancesBlocksInterceptions),
            r: fmtDecimal(totals.recoveries),
            dc: fmtDecimal(totals.defensiveContribution),
            og: fmtDecimal(totals.ownGoals),
            ps: fmtDecimal(totals.penaltiesSaved),
            pm: fmtDecimal(totals.penaltiesMissed),
            yc: fmtDecimal(totals.yellowCards),
            rc: fmtDecimal(totals.redCards),
            saves: fmtDecimal(totals.saves),
            bps: fmtDecimal(totals.bps),
          };
          const averagesByKey: Record<string, React.ReactNode> = {
            pts: fmtDecimal(averages.points, 1),
            min: fmtDecimal(averages.minutes, 0),
            g: fmtDecimal(averages.goals, 2),
            a: fmtDecimal(averages.assists, 2),
            xg: fmtDecimal(averages.xG, 2),
            xa: fmtDecimal(averages.xA, 2),
            xgi: fmtDecimal(averages.xGI, 2),
            cs: fmtDecimal(averages.cleanSheets, 2),
            st: fmtDecimal(averages.starts, 2),
            gc: fmtDecimal(averages.goalsConceded, 2),
            xgc: fmtDecimal(averages.xGC, 2),
            t: fmtDecimal(averages.tackles, 2),
            cbi: fmtDecimal(averages.clearancesBlocksInterceptions, 2),
            r: fmtDecimal(averages.recoveries, 2),
            dc: fmtDecimal(averages.defensiveContribution, 2),
            og: fmtDecimal(averages.ownGoals, 2),
            ps: fmtDecimal(averages.penaltiesSaved, 2),
            pm: fmtDecimal(averages.penaltiesMissed, 2),
            yc: fmtDecimal(averages.yellowCards, 2),
            rc: fmtDecimal(averages.redCards, 2),
            saves: fmtDecimal(averages.saves, 2),
            bps: fmtDecimal(averages.bps, 1),
          };
          return { gameweeks, totalsByKey, averagesByKey };
        })()
      : null;

  // <live_data_split>: Prime and Supplements used to share one wide table
  // (GW/Opponent/Result + all stat columns) with a two-row header — wide
  // enough that it ran off the card and pushed the Playing Time gauge off
  // screen. Split into two narrower tables instead, each repeating the
  // identity columns (GW, Opponent, Result) so it stands alone; Playing
  // Time now sits full-width beneath both rather than squeezed beside
  // them.
  function renderGwLogTable(statColumns: GwColumn[], rows: NonNullable<typeof seasonLogRows>) {
    const columns = [...identityColumns, ...statColumns];
    const statStart = identityColumns.length;
    return (
      <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} className={i === statStart ? "column-group-divider" : undefined} style={c.align === "left" ? { textAlign: "left" } : undefined}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.gameweeks.map((g) => (
              <tr key={g.round}>
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={i === statStart ? "column-group-divider" : undefined}
                    style={c.align === "left" ? { textAlign: "left", fontFamily: "var(--font-body)" } : undefined}
                  >
                    {c.cell(g)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600 }}>
              {columns.map((c, i) =>
                i === 0 ? (
                  <td key={c.key} style={{ textAlign: "left", fontFamily: "var(--font-body)" }} colSpan={identityColumns.length}>
                    Totals
                  </td>
                ) : i < identityColumns.length ? null : (
                  <td key={c.key} className={i === statStart ? "column-group-divider" : undefined} style={{ background: percentileTint(seasonLogPercentiles[c.key] ?? null) }}>
                    {rows.totalsByKey[c.key] ?? ""}
                  </td>
                ),
              )}
            </tr>
            <tr>
              {columns.map((c, i) =>
                i === 0 ? (
                  <td key={c.key} style={{ textAlign: "left", fontFamily: "var(--font-body)" }} colSpan={identityColumns.length}>
                    Average
                  </td>
                ) : i < identityColumns.length ? null : (
                  <td key={c.key} className={i === statStart ? "column-group-divider" : undefined} style={{ background: percentileTint(seasonLogPercentiles[c.key] ?? null) }}>
                    {rows.averagesByKey[c.key] ?? ""}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="profile-backdrop">
      <div className="profile-sheet">
        <button className="profile-close" onClick={close} type="button" title="Close" aria-label="Close">
          <CloseIcon />
        </button>

        <div className="profile-header">
          <div>
            <h2 style={{ marginBottom: 2 }}>{player.name}</h2>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              <PositionBadge position={player.position} /> &nbsp;{player.teamName} · {fmtPrice(player.price)} ·{" "}
              {fmtPercent(player.ownership)} owned
            </p>
          </div>
          <div className="profile-header-actions">
            <Link className="profile-icon-btn" to={`/player-comparison?players=${player.id}`} title={`Compare ${player.name}`} aria-label={`Compare ${player.name}`}>
              <CompareIcon /> Compare
            </Link>
          </div>
        </div>

        {player.status !== "a" && player.news && <div className="banner stale">{player.news}</div>}

        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

        {smallSample && !hasDataForMode(resolvedPlayer) && (
          <div className="banner info" style={{ marginBottom: 16 }}>
            No data for {player.name} in this mode — every field below shows {DASH}. Try Last Completed Season or Historic Average.
            Career History and Playing-Time Indicators below are unaffected.
          </div>
        )}

        <div className="profile-section">
          <div className="profile-section-heading">
            <h3>Views</h3>
          </div>
          <div className="profile-columns profile-columns-balanced">
            {radarGroups.map((group) => (
              <div className="card" key={group.label || "combined"}>
                <div className="card-title">
                  Percentile Radar{group.label ? ` — ${group.label}` : ` — ${player.position}`}
                  {smallSample && <span style={{ color: "var(--accent-value)" }}> (below eligibility threshold)</span>}
                </div>
                <PercentileRadarChart data={smallSample ? group.data.map((d) => ({ ...d, percentile: null })) : group.data} />
              </div>
            ))}

            <div className="card">
              <div className="card-title">Actual vs Expected</div>
              {smallSample && (
                <div className="banner info" style={{ marginBottom: 12 }}>
                  Small sample — below the current minutes eligibility threshold ({filters.minMinutes} min). Read with caution.
                </div>
              )}
              <ActualVsExpectedBars
                rows={[
                  { label: "Goals − xG", value: derived.goalsMinusXG },
                  { label: "Assists − xA", value: derived.assistsMinusXA },
                  { label: "Goal Inv. − xGI", value: derived.goalInvolvementsMinusXGI },
                ]}
              />
            </div>

            <div className="card">
              <div className="card-title">Underlying Numbers</div>
              {radarGroups.length > 1 ? (
                <>
                  <div className="card-title" style={{ marginBottom: 8 }}>Defensive</div>
                  <div className="stat-tile-grid">
                    <StatTile label="Clean Sheets" value={fmtDecimal(resolvedPlayer.cleanSheets)} percentile={statPercentiles.cleanSheets} />
                    <StatTile label="xGC" value={fmtDecimal(resolvedPlayer.xGC, 2)} percentile={statPercentiles.xGC} />
                    <StatTile label="Def. Contrib." value={fmtDecimal(resolvedPlayer.defensiveContributions)} percentile={statPercentiles.defensiveContributions} />
                  </div>
                  <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                    <StatTile label="xGC/Game" value={fmtDecimal(resolvedPlayer.xGCPerGame, 2)} percentile={statPercentiles.xGCPerGame} />
                    <StatTile label="DC/Game" value={fmtDecimal(resolvedPlayer.defensiveContributionsPerGame, 2)} percentile={statPercentiles.defensiveContributionsPerGame} />
                    <StatTile label="BPS" value={fmtDecimal(resolvedPlayer.bps)} percentile={statPercentiles.bps} />
                  </div>
                  <div className="card-title" style={{ marginTop: 16, marginBottom: 8 }}>Offensive</div>
                  <div className="stat-tile-grid">
                    <StatTile label="xG" value={fmtDecimal(resolvedPlayer.xG, 2)} percentile={statPercentiles.xG} />
                    <StatTile label="xA" value={fmtDecimal(resolvedPlayer.xA, 2)} percentile={statPercentiles.xA} />
                    <StatTile label="xGI" value={fmtDecimal(resolvedPlayer.xGI, 2)} percentile={statPercentiles.xGI} />
                  </div>
                  <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                    <StatTile label="xG/Game" value={fmtDecimal(resolvedPlayer.xGPerGame, 2)} percentile={statPercentiles.xGPerGame} />
                    <StatTile label="xA/Game" value={fmtDecimal(resolvedPlayer.xAPerGame, 2)} percentile={statPercentiles.xAPerGame} />
                    <StatTile label="xGI/Game" value={fmtDecimal(resolvedPlayer.xGIPerGame, 2)} percentile={statPercentiles.xGIPerGame} />
                  </div>
                </>
              ) : player.position === "GKP" ? (
                <>
                  <div className="stat-tile-grid">
                    <StatTile label="Clean Sheets" value={fmtDecimal(resolvedPlayer.cleanSheets)} percentile={statPercentiles.cleanSheets} />
                    <StatTile label="xGC" value={fmtDecimal(resolvedPlayer.xGC, 2)} percentile={statPercentiles.xGC} />
                    <StatTile label="Def. Contrib." value={fmtDecimal(resolvedPlayer.defensiveContributions)} percentile={statPercentiles.defensiveContributions} />
                  </div>
                  <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                    <StatTile label="xGC/Game" value={fmtDecimal(resolvedPlayer.xGCPerGame, 2)} percentile={statPercentiles.xGCPerGame} />
                    <StatTile label="DC/Game" value={fmtDecimal(resolvedPlayer.defensiveContributionsPerGame, 2)} percentile={statPercentiles.defensiveContributionsPerGame} />
                    <StatTile label="xGI" value={fmtDecimal(resolvedPlayer.xGI, 2)} percentile={statPercentiles.xGI} />
                  </div>
                </>
              ) : (
                <>
                  <div className="stat-tile-grid">
                    <StatTile label="xG" value={fmtDecimal(resolvedPlayer.xG, 2)} percentile={statPercentiles.xG} />
                    <StatTile label="xA" value={fmtDecimal(resolvedPlayer.xA, 2)} percentile={statPercentiles.xA} />
                    <StatTile label="xGI" value={fmtDecimal(resolvedPlayer.xGI, 2)} percentile={statPercentiles.xGI} />
                  </div>
                  <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                    <StatTile label="xG/Game" value={fmtDecimal(resolvedPlayer.xGPerGame, 2)} percentile={statPercentiles.xGPerGame} />
                    <StatTile label="xA/Game" value={fmtDecimal(resolvedPlayer.xAPerGame, 2)} percentile={statPercentiles.xAPerGame} />
                    <StatTile label="xGI/Game" value={fmtDecimal(resolvedPlayer.xGIPerGame, 2)} percentile={statPercentiles.xGIPerGame} />
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <div className="card-title">Value</div>
              <div className="stat-tile-grid">
                <StatTile label="Pts/£m" value={fmtDecimal(derived.pointsPerMillion, 1)} percentile={statPercentiles.pointsPerMillion} />
                <StatTile label="PPG" value={fmtDecimal(resolvedPlayer.pointsPerGame, 1)} percentile={statPercentiles.pointsPerGame} />
                <StatTile label="Min/Goal" value={fmtDecimal(derived.minutesPerGoal, 0)} percentile={statPercentiles.minutesPerGoal} />
              </div>
            </div>
          </div>
        </div>

        <hr className="profile-divider" />

        <div className="profile-section">
          <div className="profile-section-heading">
            <h3>Live Data</h3>
          </div>
          <div className="card">
            <div className="card-title">Prime</div>
            {history.status === "loading" && <p className="page-subtitle">Loading gameweek history…</p>}
            {history.status === "error" && <p className="page-subtitle">Couldn't load gameweek history: {history.errorMessage}</p>}
            {history.status === "ready" && history.history.length === 0 && <p className="page-subtitle">No gameweeks played yet this season.</p>}
            {seasonLogRows && renderGwLogTable(primeColumns, seasonLogRows)}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Supplements</div>
            {history.status === "loading" && <p className="page-subtitle">Loading gameweek history…</p>}
            {history.status === "error" && <p className="page-subtitle">Couldn't load gameweek history: {history.errorMessage}</p>}
            {history.status === "ready" && history.history.length === 0 && <p className="page-subtitle">No gameweeks played yet this season.</p>}
            {seasonLogRows && renderGwLogTable(supplementsColumns, seasonLogRows)}
          </div>

          <div className="card" style={{ marginTop: 16, maxWidth: 360 }}>
            <div className="card-title">Playing Time</div>
            {history.status === "loading" && <p className="page-subtitle" style={{ margin: 0 }}>Loading…</p>}
            {history.status === "error" && <p className="page-subtitle" style={{ margin: 0 }}>Couldn't load gameweek history.</p>}
            {history.status === "ready" &&
              (() => {
                const { averageMinutes, gameweeksPlayed } = computeSeasonAverageMinutes(history.history);
                return <PlayingTimeIcon averageMinutes={averageMinutes} gameweeksPlayed={gameweeksPlayed} />;
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
            <p className="page-subtitle">Determining the historic-average window (uses the same historic dataset as the rest of the app)…</p>
          )}
          {history.status === "ready" &&
            combinedSeasonHistory.length > 0 &&
            historicStatus !== "loading" &&
            (() => {
              // Built from completed seasons only (history.seasonHistory), not
              // combinedSeasonHistory — the live/in-progress season is a real
              // bar on the chart below (drawn dashed, via CareerHistoryChart's
              // own isLive handling), but averaging its partial totals in
              // alongside complete seasons would understate the average for
              // reasons that have nothing to do with an injury or bad season,
              // just the season not being over yet.
              const { qualifyingSeasons, windowAverage, allSeasonsInWindow } = buildHistoricPlayerProfile(history.seasonHistory, historicReferenceSeason);
              const qualifyingSeasonNames = new Set(qualifyingSeasons.map((s) => s.seasonName));
              const inWindowNames = new Set(allSeasonsInWindow.map((s) => s.seasonName));
              const trend = computeSeasonTrend(history.seasonHistory);
              const orderedSeasons = [...combinedSeasonHistory].sort((a, b) => a.seasonName.localeCompare(b.seasonName));

              // Comparative colouring for the season-by-season table —
              // each numeric column tinted relative to its OWN min/max
              // across the seasons actually shown here (same technique as
              // Player Explorer's Comparative Colouring: "how does this
              // compare to what you're looking at right now"), since this
              // is inherently a single-player, multi-season table rather
              // than something with a cross-player population to lean on.
              // Every column here is "higher is better" — there's no
              // lower-is-better figure (like xGC) in this particular table.
              const seasonTableColumns: { key: string; getValue: (s: PlayerSeasonHistory) => number | null }[] = [
                { key: "minutes", getValue: (s) => s.minutes },
                { key: "starts", getValue: (s) => s.starts },
                { key: "totalPoints", getValue: (s) => s.totalPoints },
                { key: "goals", getValue: (s) => s.goals },
                { key: "assists", getValue: (s) => s.assists },
                { key: "cleanSheets", getValue: (s) => s.cleanSheets },
                { key: "xG", getValue: (s) => s.xG },
                { key: "xA", getValue: (s) => s.xA },
                { key: "xGI", getValue: (s) => s.xGI },
              ];
              const seasonTableRanges = new Map<string, { min: number; max: number }>();
              for (const c of seasonTableColumns) {
                const values = combinedSeasonHistory.map((s) => c.getValue(s)).filter((v): v is number => v !== null);
                if (values.length > 0) seasonTableRanges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
              }
              function seasonCellTint(key: string, value: number | null): string | undefined {
                const range = seasonTableRanges.get(key);
                if (!range || value === null) return undefined;
                return relativeCellTint(value, range.min, range.max, true);
              }

              return (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                    {trend.direction !== "unknown" && (
                      <span
                        className={`num ${trend.direction === "up" ? "value-positive" : trend.direction === "down" ? "value-negative" : "value-muted"}`}
                        style={{ fontSize: 12.5 }}
                      >
                        {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "≈"} {fmtSigned(trend.pointsDelta, 0)} pts,{" "}
                        {trend.previousSeason} → {trend.latestSeason}
                      </span>
                    )}
                  </div>

                  <CareerHistoryChart
                    seasons={orderedSeasons}
                    countedSeasonNames={inWindowNames}
                    currentSeasonName={currentSeasonEntry?.seasonName ?? null}
                    averagePoints={windowAverage?.avgPointsPerSeason ?? null}
                  />

                  <div className="stat-row" style={{ marginTop: 10 }}>
                    <span className="stat-row-name">
                      Season average ({windowAverage?.seasonsPlayed ?? 0} season{windowAverage?.seasonsPlayed === 1 ? "" : "s"})
                    </span>
                    <span className="stat-row-value">
                      {windowAverage ? (
                        <>
                          {fmtDecimal(windowAverage.avgPointsPerSeason, 0)} pts · {fmtDecimal(windowAverage.avgMinutesPerSeason, 0)} mins ·{" "}
                          {fmtDecimal(windowAverage.avgGoalsPerSeason, 1)} G · {fmtDecimal(windowAverage.avgAssistsPerSeason, 1)} A
                        </>
                      ) : (
                        DASH
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="chip chip-icon"
                    style={{ marginTop: 10 }}
                    onClick={() => setShowFullCareerTable((v) => !v)}
                    title={showFullCareerTable ? "Hide season-by-season detail" : "Show season-by-season detail"}
                    aria-label={showFullCareerTable ? "Hide season-by-season detail" : "Show season-by-season detail"}
                  >
                    <ChevronIcon direction={showFullCareerTable ? "up" : "down"} />
                  </button>

                  {showFullCareerTable && (
                    <>
                      <div className="table-wrap" style={{ marginTop: 10 }}>
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
                              const isCurrentSeason = s.seasonName === currentSeasonEntry?.seasonName;
                              const inWindow = inWindowNames.has(s.seasonName);
                              const isLight = !isCurrentSeason && inWindow && !qualifyingSeasonNames.has(s.seasonName);
                              const outsideWindow = !isCurrentSeason && !inWindow;
                              return (
                                <tr
                                  key={s.seasonName}
                                  style={isLight || outsideWindow ? { color: "var(--text-muted)" } : undefined}
                                  title={
                                    isCurrentSeason
                                      ? undefined
                                      : outsideWindow
                                        ? `Outside the ${HISTORIC_WINDOW_SEASONS}-season averaging window — not counted in the average above`
                                        : isLight
                                          ? "Light season (fewer minutes than usual — e.g. injury) — still counted in the average above"
                                          : undefined
                                  }
                                >
                                  <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                                    {s.seasonName}
                                    {isCurrentSeason ? " (live)" : outsideWindow ? " †" : isLight ? " *" : ""}
                                  </td>
                                  <td>
                                    {isCurrentSeason
                                      ? fmtPrice(s.endCost)
                                      : s.startCost !== null && s.endCost !== null
                                        ? `${fmtPrice(s.startCost)}–${fmtPrice(s.endCost)}`
                                        : DASH}
                                  </td>
                                  <td style={{ background: seasonCellTint("minutes", s.minutes) }}>{fmtDecimal(s.minutes)}</td>
                                  <td style={{ background: seasonCellTint("starts", s.starts) }}>{s.starts !== null ? fmtDecimal(s.starts) : DASH}</td>
                                  <td style={{ background: seasonCellTint("totalPoints", s.totalPoints) }}>{fmtDecimal(s.totalPoints)}</td>
                                  <td style={{ background: seasonCellTint("goals", s.goals) }}>{fmtDecimal(s.goals)}</td>
                                  <td style={{ background: seasonCellTint("assists", s.assists) }}>{fmtDecimal(s.assists)}</td>
                                  <td style={{ background: seasonCellTint("cleanSheets", s.cleanSheets) }}>{fmtDecimal(s.cleanSheets)}</td>
                                  <td style={{ background: seasonCellTint("xG", s.xG) }}>{fmtDecimal(s.xG, 2)}</td>
                                  <td style={{ background: seasonCellTint("xA", s.xA) }}>{fmtDecimal(s.xA, 2)}</td>
                                  <td style={{ background: seasonCellTint("xGI", s.xGI) }}>{fmtDecimal(s.xGI, 2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
        </div>
        </div>
      </div>
    </div>
  );
}
