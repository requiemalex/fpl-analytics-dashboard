import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { useDialogFocus } from "../state/useDialogFocus";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { usePlayerHistory } from "../state/usePlayerHistory";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computeRadarDataForAxes, getRadarAxisGroupsForPosition } from "../metrics/radarStats";
import { perMatchPositionPercentile, teamMatchesPlayed } from "../metrics/profileComparisons";
import { positionRanks } from "../metrics/comparativeColour";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes, isFixedFloorSmallSample } from "../metrics/fixedMinutesFloor";
import { percentileTint } from "../utils/colorScale";
import { percentileInPool } from "../metrics/percentiles";
import { estimatedGamesFromMinutes } from "../metrics/calculations";
import { PercentileRadarChart } from "./PlayerRadarChart";
import { ProfileSummary, type SummaryGroup } from "./playerProfile/ProfileSummary";
import { AssistsIcon, AverageLineIcon, GoalsIcon, PointsHistoryChart, PointsHistoryHeader, PointsHistoryStats } from "./playerProfile/PointsHistory";
import { ClockIcon, CloseIcon } from "./IconToolbar";
import { PlayingTimeIcon } from "./playerProfile/PlayingTimeIcon";
import { computeSeasonAverageMinutes } from "../metrics/rotationIndicators";
import { partialAverage, partialTotal, sumKnown, type PartialSum } from "../metrics/partialTotals";
import { computeSeasonTrend } from "../metrics/careerMetrics";
import { buildHistoricPlayerProfile, nextSeasonName } from "../metrics/historicAnalysis";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode, modeDataKnown, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { AnalysisModeToggle, ANALYSIS_MODE_OPTIONS } from "./AnalysisModeToggle";
import { isSmallSample, profileFloorNote, SmallSampleBadge, smallSampleNote } from "./MinutesFloorBadge";
import { PositionBadge, withCoverage } from "./primitives";
import { countDecimals } from "./playerColumns";
import { fmtDecimal, fmtPrice, fmtPercent, fmtSigned, DASH } from "../utils/format";
import { usePlayerPastSeasons } from "../state/usePlayerPastSeasons";
import { useExternalStats, type ProfileView } from "../extensions/externalStats";
import { SourceToggle } from "./SourceToggle";
import type { NormalizedPlayer, PlayerSeasonHistory, PlayerGameweekHistory, PlayerPastMatch } from "../types/normalized";
import { playerRankHint } from "./hoverText";
import { matchRecordShortfall } from "../metrics/matchRecordCheck";


/**
 * The Match Log's compared columns (live season): each one's season total on
 * NormalizedPlayer (the whole-pool bootstrap data), against which the
 * table's Totals and Average rows are ranked. Only columns with a season total for everyone
 * are here — goals conceded, tackles and the like are only ever
 * known per gameweek for the one player being viewed (usePlayerHistory is
 * lazy-loaded per player), so there's no population to compare them with.
 */
// `rankTotal`: what the Totals row's colour ranks on when it isn't the total
// itself. A lower-is-better total grows with minutes, so ranked on itself a
// bench player would look best; xGC ranks on xGC per game (audit 2026-10-18
// M13, as PlayerColumn.rankBy).
const LIVE_LOG_METRICS: Record<string, { total: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean; rankTotal?: (p: NormalizedPlayer) => number | null }> = {
  pts: { total: (p) => p.totalPoints, higherIsBetter: true },
  min: { total: (p) => p.minutes, higherIsBetter: true },
  starts: { total: (p) => p.starts, higherIsBetter: true },
  g: { total: (p) => p.goals, higherIsBetter: true },
  a: { total: (p) => p.assists, higherIsBetter: true },
  xg: { total: (p) => p.xG, higherIsBetter: true },
  xa: { total: (p) => p.xA, higherIsBetter: true },
  xgi: { total: (p) => p.xGI, higherIsBetter: true },
  cs: { total: (p) => p.cleanSheets, higherIsBetter: true },
  xgc: { total: (p) => p.xGC, higherIsBetter: false, rankTotal: (p) => p.xGCPerGame },
  dc: { total: (p) => p.defensiveContributions, higherIsBetter: true },
  saves: { total: (p) => p.saves, higherIsBetter: true },
  bps: { total: (p) => p.bps, higherIsBetter: true },
};

/** The player `?player=` names, and whether it names one that doesn't exist (an old link, or not a number) — shown as a message rather than silently ignored. */
function useSelectedPlayer(): [NormalizedPlayer | null, (id: number | null) => void, boolean] {
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

  return [player, setId, id !== null && player === null];
}

/**
 * One row of the Match Log, whichever season it shows: the live season's
 * gameweek history (element-summary) or a completed season's match rows
 * (/api/player-seasons). Null where FPL didn't record the stat that season.
 */
interface MatchLogRow {
  fixtureId: number;
  round: number | null;
  opponent: string;
  wasHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  minutes: number;
  starts: number | null;
  totalPoints: number;
  goals: number;
  assists: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  cleanSheets: number;
  xGC: number | null;
  dc: number | null;
  saves: number | null;
  bps: number | null;
}

function pastMatchRow(m: PlayerPastMatch): MatchLogRow {
  return {
    fixtureId: m.fixture,
    round: m.round,
    opponent: m.opponentShortName || "???",
    wasHome: m.home,
    teamScore: m.teamScore,
    opponentScore: m.opponentScore,
    minutes: m.minutes,
    starts: m.starts,
    totalPoints: m.totalPoints,
    goals: m.goals,
    assists: m.assists,
    xG: m.xG,
    xA: m.xA,
    xGI: m.xGI,
    cleanSheets: m.cleanSheets,
    xGC: m.xGC,
    dc: m.dc,
    saves: m.saves,
    bps: m.bps,
  };
}

function liveMatchRow(g: PlayerGameweekHistory, opponentShortName: string): MatchLogRow {
  return {
    fixtureId: g.fixtureId,
    round: g.round,
    opponent: opponentShortName,
    wasHome: g.wasHome,
    teamScore: g.teamScore,
    opponentScore: g.opponentScore,
    minutes: g.minutes,
    starts: g.starts,
    totalPoints: g.totalPoints,
    goals: g.goals,
    assists: g.assists,
    xG: g.xG,
    xA: g.xA,
    xGI: g.xGI,
    cleanSheets: g.cleanSheets,
    xGC: g.xGC,
    dc: g.defensiveContribution,
    saves: g.saves,
    bps: g.bps,
  };
}

/** Each Match Log column's figure, how its Totals and Average rows are written, and its total in a past season's comparison pool (PlayerSeasonPeer.totals). */
const LOG_VALUES: Record<string, { value: (r: MatchLogRow) => number | null; totalDp: number; averageDp: number; peerTotal: string }> = {
  pts: { value: (r) => r.totalPoints, totalDp: 0, averageDp: 1, peerTotal: "totalPoints" },
  min: { value: (r) => r.minutes, totalDp: 0, averageDp: 0, peerTotal: "minutes" },
  starts: { value: (r) => r.starts, totalDp: 0, averageDp: 2, peerTotal: "starts" },
  g: { value: (r) => r.goals, totalDp: 0, averageDp: 2, peerTotal: "goals" },
  a: { value: (r) => r.assists, totalDp: 0, averageDp: 2, peerTotal: "assists" },
  xg: { value: (r) => r.xG, totalDp: 2, averageDp: 2, peerTotal: "xG" },
  xa: { value: (r) => r.xA, totalDp: 2, averageDp: 2, peerTotal: "xA" },
  xgi: { value: (r) => r.xGI, totalDp: 2, averageDp: 2, peerTotal: "xGI" },
  cs: { value: (r) => r.cleanSheets, totalDp: 0, averageDp: 2, peerTotal: "cleanSheets" },
  xgc: { value: (r) => r.xGC, totalDp: 2, averageDp: 2, peerTotal: "xGC" },
  dc: { value: (r) => r.dc, totalDp: 0, averageDp: 2, peerTotal: "dc" },
  saves: { value: (r) => r.saves, totalDp: 0, averageDp: 2, peerTotal: "saves" },
  bps: { value: (r) => r.bps, totalDp: 0, averageDp: 1, peerTotal: "bps" },
};

/**
 * Each column's Totals and Average over a log's matches, whichever season
 * (<partial_totals>): the matches with a figure added up, a match without
 * one left out. A match he didn't play in shows "—" in its row
 * (<no_minutes_no_figures>), but it still counts in the Average as a match
 * with nothing in it — the Average is per match listed, the basis every
 * other player's Average it's coloured against uses — even where FPL wrote
 * nothing; unless no match he played has the figure (a stat FPL didn't
 * record that season, like xG before 2022/23): that column is "—".
 */
function logSums(rows: MatchLogRow[]): Record<string, PartialSum | null> {
  const out: Record<string, PartialSum | null> = {};
  const played = rows.some((r) => r.minutes > 0);
  for (const [key, { value }] of Object.entries(LOG_VALUES)) {
    if (played && !rows.some((r) => r.minutes > 0 && value(r) !== null)) {
      out[key] = null;
      continue;
    }
    out[key] = sumKnown(
      rows.map((r) => {
        const v = value(r);
        return v === null && r.minutes === 0 ? 0 : v;
      }),
    );
  }
  return out;
}

/** A log's Totals and Average rows as written, each saying on hover when it's from only some of the matches. */
function logFooter(sums: Record<string, PartialSum | null>): { totalsByKey: Record<string, React.ReactNode>; averagesByKey: Record<string, React.ReactNode> } {
  const totalsByKey: Record<string, React.ReactNode> = {};
  const averagesByKey: Record<string, React.ReactNode> = {};
  for (const [key, { totalDp, averageDp }] of Object.entries(LOG_VALUES)) {
    const s = sums[key];
    totalsByKey[key] = withCoverage(fmtDecimal(partialTotal(s), totalDp), s);
    averagesByKey[key] = withCoverage(fmtDecimal(partialAverage(s), averageDp), s);
  }
  return { totalsByKey, averagesByKey };
}

/** Win/draw/loss from this player's own team's perspective, plus the score written as their-goals–opponent-goals — never assumed from the raw home/away score pair directly, since that already got resolved to teamScore/opponentScore during normalization. */
function gameweekResult(g: Pick<MatchLogRow, "teamScore" | "opponentScore">): { label: string; outcomeClass: string } {
  if (g.teamScore === null || g.opponentScore === null) return { label: DASH, outcomeClass: "value-muted" };
  const label = `${g.teamScore}–${g.opponentScore}`;
  if (g.teamScore > g.opponentScore) return { label, outcomeClass: "value-positive" };
  if (g.teamScore < g.opponentScore) return { label, outcomeClass: "value-negative" };
  return { label, outcomeClass: "value-muted" };
}

/** A season with no match-by-match record (before 2016/17): FPL's season totals, in the Match Log's column order. */
function SeasonTotalsTable({ season }: { season: PlayerSeasonHistory }) {
  const cells: [string, string][] = [
    ["Points", fmtDecimal(season.totalPoints, 0)],
    ["Minutes", fmtDecimal(season.minutes, 0)],
    ["Starts", fmtDecimal(season.starts, 0)],
    ["Goals", fmtDecimal(season.goals, 0)],
    ["Assists", fmtDecimal(season.assists, 0)],
    ["xG", fmtDecimal(season.xG, 2)],
    ["xA", fmtDecimal(season.xA, 2)],
    ["xGI", fmtDecimal(season.xGI, 2)],
    ["Clean Sheets", fmtDecimal(season.cleanSheets, 0)],
    ["BPS", fmtDecimal(season.bps, 0)],
  ];
  return (
    <div className="table-wrap">
      <table className="data-table compact" aria-label={`${season.seasonName} season totals`}>
        <thead>
          <tr>
            {cells.map(([label]) => (
              <th key={label} className="col-source-fpl">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cells.map(([label, value]) => (
              <td key={label}>{value}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PlayerDetailOverlay() {
  const {
    players,
    teamsById,
    fixtures,
    historicReferenceSeason,
    historicStatus,
    historicProfiles,
    historicSkippedPlayerIds,
    allTimeSeasonsByPlayerId,
    currentSeasonHasStarted,
    requestHistoricData,
    liveDataVersion,
  } = useAppState();
  const [player, setPlayerId, unknownPlayerLink] = useSelectedPlayer();
  const isOpen = player !== null;
  // Only an open profile needs the historic dataset (it opens on Last
  // Completed Season, and Points History's window needs it). This overlay
  // is mounted on every page, so asking on mount started the one-minute
  // bulk build everywhere, even on the User Guide (audit 2026-09-25
  // player-team-profiles M3).
  useEffect(() => {
    if (isOpen) requestHistoricData();
  }, [isOpen, requestHistoricData]);
  // The profile's own analysis-mode — deliberately independent of
  // whatever mode happens to be selected on the page underneath it (see
  // state/scoutingFilters.ts). It has no Min Minutes control, so its
  // percentiles use the fixed floor (<fixed_minutes_floor>).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const minutesFloor = fixedFloorMinutes(analysisMode);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  const history = usePlayerHistory(player?.id ?? null, liveDataVersion);

  // The live season, shaped like a PlayerSeasonHistory entry so it can slot
  // straight into the same career-history table/average/qualifying logic
  // as prior seasons. Resolved as Current Season is everywhere else, so
  // before the season starts its cumulative stats read 0 — FPL's live
  // fields still carry last season's totals until then
  // (<live_mode_preseason_fix>, resolvePlayerStats.ts; audit 2026-09-25
  // player-team-profiles H2). Price is live either way. Needs
  // historicReferenceSeason (the last COMPLETED season) to name itself, so
  // it's absent until that's loaded at least once.
  const currentSeasonEntry: PlayerSeasonHistory | null = useMemo(() => {
    if (!player || !historicReferenceSeason) return null;
    const live = resolvePlayerStats(player, "live", undefined, currentSeasonHasStarted);
    return {
      seasonName: nextSeasonName(historicReferenceSeason),
      totalPoints: live.totalPoints ?? 0,
      minutes: live.minutes ?? 0,
      starts: live.starts,
      goals: live.goals ?? 0,
      assists: live.assists ?? 0,
      cleanSheets: live.cleanSheets ?? 0,
      goalsConceded: live.goalsConceded,
      bonus: live.bonus ?? 0,
      bps: live.bps ?? 0,
      ictIndex: live.ictIndex,
      startCost: live.price,
      endCost: live.price,
      xG: live.xG,
      xA: live.xA,
      xGI: live.xGI,
      xGC: live.xGC,
      defensiveContribution: live.defensiveContributions,
      saves: live.saves,
      penaltiesSaved: live.penaltiesSaved,
      yellowCards: live.yellowCards,
      redCards: live.redCards,
      influence: live.influence,
      creativity: live.creativity,
      threat: live.threat,
      tackles: live.tackles,
      clearancesBlocksInterceptions: live.clearancesBlocksInterceptions,
      recoveries: live.recoveries,
    };
  }, [player, historicReferenceSeason, currentSeasonHasStarted]);

  const combinedSeasonHistory = currentSeasonEntry ? [...history.seasonHistory, currentSeasonEntry] : history.seasonHistory;

  // The Match Log's season: the live one, unless a season has been picked
  // on Points History. Tied to the player, so the next one opens on live.
  const [pickedSeason, setPickedSeason] = useState<{ playerId: number; season: string } | null>(null);
  // Match Log columns switched to the second source's figure with their ⇄ toggle — FPL for each player opened.
  const [switchedLog, setSwitchedLog] = useState<{ playerId: number; keys: string[] } | null>(null);
  const liveSeasonName = currentSeasonEntry?.seasonName ?? null;
  const pastLogSeason = pickedSeason && pickedSeason.playerId === player?.id && pickedSeason.season !== liveSeasonName ? pickedSeason.season : null;
  const logSeason = pastLogSeason ?? liveSeasonName;
  const pastSeasons = usePlayerPastSeasons(player?.code ?? null, pastLogSeason !== null);

  // A second source's cards follow the Data View over the same seasons the
  // profile's own figures use — its Historic Average only the window
  // seasons reaching the fixed floor (<fixed_minutes_floor>). Null while
  // they're still being worked out.
  const external = useExternalStats();
  const playerCode = player?.code ?? null;
  const externalView: ProfileView = useMemo(() => {
    const failed = historicStatus === "error" || history.status === "error";
    if (analysisMode === "live") return { mode: analysisMode, seasons: liveSeasonName ? [liveSeasonName] : failed ? [] : null };
    if (analysisMode === "lastSeason") return { mode: analysisMode, seasons: historicReferenceSeason ? [historicReferenceSeason] : failed ? [] : null };
    if (history.status !== "ready" || historicReferenceSeason === null) return { mode: analysisMode, seasons: failed ? [] : null };
    return { mode: analysisMode, seasons: buildHistoricPlayerProfile(history.seasonHistory, historicReferenceSeason).floorSeasonsInWindow.map((s) => s.seasonName) };
  }, [analysisMode, liveSeasonName, historicReferenceSeason, historicStatus, history.status, history.seasonHistory]);
  useEffect(() => {
    if (!external || playerCode === null) return;
    const wanted = new Set([...(externalView.seasons ?? []), ...(logSeason ? [logSeason] : [])]);
    if (wanted.size > 0) external.profiles.requestPlayer(playerCode, [...wanted]);
  }, [external, playerCode, externalView, logSeason]);

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
  // DEF/MID; see getRadarAxisGroupsForPosition). The pool is everyone at or
  // above the fixed minutes floor, so a cameo can't top a per-game axis or
  // a 0-minute player pad the bottom (audit 2026-09-25 player-team-profiles
  // H1); a player under it gets no percentile.
  const radarGroups = useMemo(() => {
    if (!player) return [];
    const resolved = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
    return getRadarAxisGroupsForPosition(player.position).map((group) => ({
      label: group.label,
      data: computeRadarDataForAxes(group.axes, resolved, resolvedPlayers, minutesFloor),
    }));
  }, [player, analysisMode, historicProfiles, currentSeasonHasStarted, resolvedPlayers, minutesFloor]);

  // Comparative colouring for the Summary's tiles —
  // same green-better/red-worse language as Player Explorer's Comparative
  // Colouring and Player Comparison's cell tints, but relative to this
  // player's within-POSITION percentile (computePositionPercentiles, the
  // same population and fixed floor the Percentile Radar above uses)
  // rather than a visible row range, since a single-player card has no
  // "rows on screen" to compare against. A small-sample player (below the
  // floor) gets `null` back from computePositionPercentiles, so no tint is
  // shown rather than a misleading one.
  const statPercentiles = useMemo(() => {
    if (!player) return {} as Record<string, number | null>;
    const metrics: Record<string, { fn: (p: NormalizedPlayer) => number | null; higherIsBetter: boolean }> = {
      cleanSheets: { fn: (p) => p.cleanSheets, higherIsBetter: true },
      // A lower-is-better total ranks on its rate (audit 2026-10-18 M13).
      xGC: { fn: (p) => p.xGCPerGame, higherIsBetter: false },
      defensiveContributions: { fn: (p) => p.defensiveContributions, higherIsBetter: true },
      xGCPerGame: { fn: (p) => p.xGCPerGame, higherIsBetter: false },
      defensiveContributionsPerGame: { fn: (p) => p.defensiveContributionsPerGame, higherIsBetter: true },
      bps: { fn: (p) => p.bps, higherIsBetter: true },
      saves: { fn: (p) => p.saves, higherIsBetter: true },
      savesPerGame: { fn: (p) => p.savesPerGame, higherIsBetter: true },
      xG: { fn: (p) => p.xG, higherIsBetter: true },
      xA: { fn: (p) => p.xA, higherIsBetter: true },
      xGI: { fn: (p) => p.xGI, higherIsBetter: true },
      xGPerGame: { fn: (p) => p.xGPerGame, higherIsBetter: true },
      xAPerGame: { fn: (p) => p.xAPerGame, higherIsBetter: true },
      xGIPerGame: { fn: (p) => p.xGIPerGame, higherIsBetter: true },
      pointsPerGame: { fn: (p) => p.pointsPerGame, higherIsBetter: true },
      pointsPerMillion: { fn: (p) => getPlayerDerivedMetrics(p).pointsPerMillion, higherIsBetter: true },
      minutesPerGoal: { fn: (p) => getPlayerDerivedMetrics(p).minutesPerGoal, higherIsBetter: false },
      // Over-performance is better (<comparative_colouring>), as in the Explorers.
      goalsMinusXG: { fn: (p) => getPlayerDerivedMetrics(p).goalsMinusXG, higherIsBetter: true },
      assistsMinusXA: { fn: (p) => getPlayerDerivedMetrics(p).assistsMinusXA, higherIsBetter: true },
      goalInvolvementsMinusXGI: { fn: (p) => getPlayerDerivedMetrics(p).goalInvolvementsMinusXGI, higherIsBetter: true },
    };
    const result: Record<string, number | null> = {};
    for (const [key, { fn, higherIsBetter }] of Object.entries(metrics)) {
      const ranks = positionRanks(resolvedPlayers, { id: (p) => p.id, position: (p) => p.position, minutes: (p) => p.minutes, mode: analysisMode, value: fn, higherIsBetter });
      result[key] = ranks.get(player.id) ?? null;
    }
    return result;
  }, [player, resolvedPlayers, analysisMode]);

  // The live Match Log's Totals and Average rows are always live-season
  // data regardless of the analysis-mode toggle above (see
  // <match_log_follows_season> below), so their comparative colouring is
  // always computed against the LIVE population too — never whichever
  // mode happens to be selected elsewhere on the page. Same fixed floor as
  // the rest of the profile, at its Current Season value.
  const liveResolvedPlayers = useMemo(
    () => resolvePlayerStatsList(players, "live", historicProfiles, currentSeasonHasStarted).resolved,
    [players, historicProfiles, currentSeasonHasStarted],
  );

  // Totals: this player's within-position percentile of each season total.
  const seasonLogPercentiles = useMemo(() => {
    if (!player) return {} as Record<string, number | null>;
    const result: Record<string, number | null> = {};
    for (const [key, { total, higherIsBetter, rankTotal }] of Object.entries(LIVE_LOG_METRICS)) {
      const ranks = positionRanks(liveResolvedPlayers, { id: (p) => p.id, position: (p) => p.position, minutes: (p) => p.minutes, mode: "live", value: rankTotal ?? total, higherIsBetter });
      result[key] = ranks.get(player.id) ?? null;
    }
    return result;
  }, [player, liveResolvedPlayers]);

  // Average: the per-match figure the row shows (total ÷ matches in his
  // log) ranked against the rest of his position's per-match figures —
  // each their season total ÷ their club's finished matches. Never the
  // Totals row's rank, which coloured a late joiner's strong per-match
  // figures red (audit 2026-09-25 player-team-profiles L5). A player under
  // the floor gets no colour, as in the Totals row.
  const matchesByTeam = useMemo(() => teamMatchesPlayed(fixtures), [fixtures]);
  // The live season's Match Log rows, newest first, and their Totals and Average (<partial_totals>).
  const liveLogRows = useMemo(
    () =>
      history.status === "ready"
        ? [...history.history].sort((a, b) => b.round - a.round || b.fixtureId - a.fixtureId).map((g) => liveMatchRow(g, teamsById.get(g.opponentTeamId)?.shortName ?? "???"))
        : [],
    [history.status, history.history, teamsById],
  );
  const liveLogSums = useMemo(() => logSums(liveLogRows), [liveLogRows]);
  const seasonLogAveragePercentiles = useMemo(() => {
    const result: Record<string, number | null> = {};
    if (!player || liveLogRows.length === 0) return result;
    const liveMinutes = liveResolvedPlayers.find((p) => p.id === player.id)?.minutes ?? null;
    if (liveMinutes === null || liveMinutes < fixedFloorMinutes("live")) return result;
    for (const [key, { total, higherIsBetter }] of Object.entries(LIVE_LOG_METRICS)) {
      const raw = perMatchPositionPercentile(partialAverage(liveLogSums[key] ?? null), player, liveResolvedPlayers, total, matchesByTeam, fixedFloorMinutes("live"));
      result[key] = raw === null ? null : higherIsBetter ? raw : 100 - raw;
    }
    return result;
  }, [player, liveLogRows, liveLogSums, liveResolvedPlayers, matchesByTeam]);

  // Escape closes the profile, like its × button (the current setter, so it
  // never restores an out-of-date address) — and only the profile, when
  // something opened before it is still open underneath.
  useEscapeLayer(isOpen || unknownPlayerLink, () => setPlayerId(null));
  useDialogFocus(isOpen || unknownPlayerLink, sheetRef);

  if (unknownPlayerLink) {
    return (
      <div className="profile-backdrop">
        <div className="profile-sheet" ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <button className="profile-close" onClick={() => setPlayerId(null)} type="button" title="Close" aria-label="Close">
            <CloseIcon />
          </button>
          <h2 id={headingId}>Player not found</h2>
          <p className="page-subtitle">This link is to a player who isn't in FPL's current player list.</p>
        </div>
      </div>
    );
  }

  if (!player) return null;

  // The stat cards below use this — identity fields (name, team, position,
  // price/ownership in the header, Points History, Playing-Time
  // Indicators) all stay on the live `player` throughout,
  // matching how every other page keeps identity live and only resolves
  // the performance figures.
  const resolvedPlayer = resolvePlayerStats(player, analysisMode, historicProfiles.get(player.id), currentSeasonHasStarted);
  const derived = getPlayerDerivedMetrics(resolvedPlayer);
  // A historic Data View's figures are only known once the historic dataset
  // has loaded, and only if the server could build this player's. Until then
  // (or if it failed, which the Data View toggle reports with a Retry)
  // every figure is null for reasons that have nothing to do with the
  // player, so nothing here claims he has no data (audit 2026-09-25
  // player-team-profiles M2, R4).
  const skippedByServer = analysisMode !== "live" && historicStatus === "ready" && historicSkippedPlayerIds.includes(player.id);
  // <live_vs_resolved_bug>: checks the RESOLVED player's minutes —
  // whichever the active mode resolved to — never the live player's, which
  // flagged well-sampled historic records as small samples early in a
  // season. Under the fixed floor (<fixed_minutes_floor>) he has no
  // percentile, so the radars and tints are blank. In Historic Average a
  // player who played but never reached the floor in a season has nothing
  // counted, so no figures at all: a small sample, not "no data".
  const smallSample = isFixedFloorSmallSample(resolvedPlayer.minutes, analysisMode, historicProfiles.get(player.id));
  const modeKnown = modeDataKnown(analysisMode, historicStatus, historicSkippedPlayerIds, player.id);
  // <minutes_marker>, <no_data_is_zero>: the stopwatches go by the same test
  // as every list's (isSmallSample) — no minutes for the mode counts as 0,
  // so a player with no data is under the floor too, amber on the Data View
  // toggle and on every card, while the words still say "no data".
  const underFloor = smallSample || (modeKnown && isSmallSample(resolvedPlayer.minutes, analysisMode));
  // The amber stopwatch on every card whose figures are left uncoloured for it (<minutes_marker>).
  const smallSampleBadge = underFloor ? <SmallSampleBadge note={smallSampleNote(resolvedPlayer.minutes, analysisMode)} /> : null;
  const noDataForMode = modeKnown && !hasDataForMode(resolvedPlayer) && !smallSample;
  // Other Data Views where he actually played, for the no-data message —
  // never the one already selected, and never one where all he has is 0
  // minutes, which would only show a 0-minute small sample (T2).
  const modesWithData = noDataForMode
    ? ANALYSIS_MODE_OPTIONS.filter((o) => {
        if (o.mode === analysisMode) return false;
        const r = resolvePlayerStats(player, o.mode, historicProfiles.get(player.id), currentSeasonHasStarted);
        return hasDataForMode(r) && (r.minutes ?? 0) > 0;
      }).map((o) => o.label)
    : [];

  function close() {
    setPlayerId(null);
  }

  // The Summary (ProfileSummary): every figure the Views give, as tiles, by
  // position. DEF and MID score points from both facets — same reasoning as
  // the split Defense/Offense percentile radars — so they get both groups; a
  // forward the offensive one; a goalkeeper the defensive one, with saves
  // (which score him points) where an outfielder's Defensive Contributions
  // would be: FPL's DC points exclude goalkeepers, so DC only ever reads 0
  // for them (audit 2026-09-25 player-team-profiles L4). Then everyone's
  // Actual vs Expected beside Value.
  const tile = (label: string, value: string, key: string) => ({ label, value, percentile: statPercentiles[key] });
  const countDp = countDecimals(analysisMode);
  const defensiveGroup: SummaryGroup =
    player.position === "GKP"
      ? {
          title: "Defensive",
          figures: [
            tile("Clean Sheets", fmtDecimal(resolvedPlayer.cleanSheets, countDp), "cleanSheets"),
            tile("xGC", fmtDecimal(resolvedPlayer.xGC, 2), "xGC"),
            tile("Saves", fmtDecimal(resolvedPlayer.saves, countDp), "saves"),
            tile("xGC/Game", fmtDecimal(resolvedPlayer.xGCPerGame, 2), "xGCPerGame"),
            tile("Saves/Game", fmtDecimal(resolvedPlayer.savesPerGame, 2), "savesPerGame"),
            tile("BPS", fmtDecimal(resolvedPlayer.bps, countDp), "bps"),
          ],
        }
      : {
          title: "Defensive",
          figures: [
            tile("Clean Sheets", fmtDecimal(resolvedPlayer.cleanSheets, countDp), "cleanSheets"),
            tile("xGC", fmtDecimal(resolvedPlayer.xGC, 2), "xGC"),
            tile("Def. Contrib.", fmtDecimal(resolvedPlayer.defensiveContributions, countDp), "defensiveContributions"),
            tile("xGC/Game", fmtDecimal(resolvedPlayer.xGCPerGame, 2), "xGCPerGame"),
            tile("DC/Game", fmtDecimal(resolvedPlayer.defensiveContributionsPerGame, 2), "defensiveContributionsPerGame"),
            tile("BPS", fmtDecimal(resolvedPlayer.bps, countDp), "bps"),
          ],
        };
  const offensiveGroup: SummaryGroup = {
    title: "Offensive",
    figures: [
      tile("xG", fmtDecimal(resolvedPlayer.xG, 2), "xG"),
      tile("xA", fmtDecimal(resolvedPlayer.xA, 2), "xA"),
      tile("xGI", fmtDecimal(resolvedPlayer.xGI, 2), "xGI"),
      tile("xG/Game", fmtDecimal(resolvedPlayer.xGPerGame, 2), "xGPerGame"),
      tile("xA/Game", fmtDecimal(resolvedPlayer.xAPerGame, 2), "xAPerGame"),
      tile("xGI/Game", fmtDecimal(resolvedPlayer.xGIPerGame, 2), "xGIPerGame"),
    ],
  };
  const summaryGroups: SummaryGroup[] = [
    ...(player.position === "FWD" ? [] : [defensiveGroup]),
    ...(player.position === "GKP" ? [] : [offensiveGroup]),
    {
      title: "Actual vs Expected",
      figures: [
        tile("Goals − xG", fmtSigned(derived.goalsMinusXG, 2), "goalsMinusXG"),
        tile("Assists − xA", fmtSigned(derived.assistsMinusXA, 2), "assistsMinusXA"),
        tile("Goal Inv. − xGI", fmtSigned(derived.goalInvolvementsMinusXGI, 2), "goalInvolvementsMinusXGI"),
      ],
    },
    {
      title: "Value",
      figures: [
        tile("Pts/£m", fmtDecimal(derived.pointsPerMillion, 1), "pointsPerMillion"),
        tile("PPG", fmtDecimal(resolvedPlayer.pointsPerGame, 1), "pointsPerGame"),
        tile("Min/Goal", fmtDecimal(derived.minutesPerGoal, 0), "minutesPerGoal"),
      ],
    },
  ];

  type GwColumn = { key: string; header: string; align?: "left"; title?: string; className?: string; cell: (g: MatchLogRow) => React.ReactNode };

  // <match_log_follows_season>: the Match Log shows one season's matches —
  // the live season's gameweek history (element-summary) unless a
  // completed season has been picked on Points History, whose rows come
  // from /api/player-seasons (the same ledger the club figures are built
  // from). Either way it's independent of the Data View toggle above, which
  // drives the Views only.
  const identityColumns: GwColumn[] = [
    { key: "gw", header: "GW", align: "left", cell: (g) => g.round ?? DASH },
    {
      key: "opp",
      header: "Opponent",
      align: "left",
      cell: (g) => (
        <>
          {g.opponent} <span className="team">({g.wasHome ? "H" : "A"})</span>
        </>
      ),
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
  // goalkeepers per official FPL scoring rules — see README's "Metric
  // methodology" (Defensive Reward/Game) — so it's hidden for GKP
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
    { key: "pts", header: "Points", cell: (g) => fmtDecimal(g.totalPoints, 0) },
    { key: "min", header: "Minutes", cell: (g) => fmtDecimal(g.minutes, 0) },
    { key: "starts", header: "Starts", cell: (g) => fmtDecimal(g.starts, 0) },
    { key: "g", header: "Goals", cell: (g) => fmtDecimal(g.goals, 0) },
    { key: "a", header: "Assists", cell: (g) => fmtDecimal(g.assists, 0) },
    { key: "xg", header: "xG", cell: (g) => fmtDecimal(g.xG, 2) },
    { key: "xa", header: "xA", cell: (g) => fmtDecimal(g.xA, 2) },
    { key: "xgi", header: "xGI", cell: (g) => fmtDecimal(g.xGI, 2) },
    { key: "cs", header: "Clean Sheets", cell: (g) => fmtDecimal(g.cleanSheets, 0) },
    { key: "xgc", header: "xGC", cell: (g) => fmtDecimal(g.xGC, 2) },
    ...(isGoalkeeper ? [] : [{ key: "dc", header: "Defensive Contributions", cell: (g: MatchLogRow) => fmtDecimal(g.dc, 0) }]),
    ...(isGoalkeeper ? [{ key: "saves", header: "Saves", cell: (g: MatchLogRow) => fmtDecimal(g.saves, 0) }] : []),
    { key: "bps", header: "BPS", cell: (g) => fmtDecimal(g.bps, 0) },
  ];

  /** A log, with its Totals and Average rows' percentiles (higher already better) for their tints — none when it can't be compared. */
  type MatchLog = {
    rows: MatchLogRow[];
    totalsByKey: Record<string, React.ReactNode>;
    averagesByKey: Record<string, React.ReactNode>;
    totalPercentiles: Record<string, number | null>;
    averagePercentiles: Record<string, number | null>;
  };

  // The live season: its gameweek history, with Totals and Average tinted
  // against the live population (seasonLogPercentiles above).
  const liveLog: MatchLog | null =
    liveLogRows.length > 0 ? { rows: liveLogRows, ...logFooter(liveLogSums), totalPercentiles: seasonLogPercentiles, averagePercentiles: seasonLogAveragePercentiles } : null;

  // A completed season: its match rows, its Totals and Average tinted as
  // the live season's are (<past_season_tints>) — ranked within his
  // position that season (his position then, from the ledger) among
  // everyone at or above the fixed floor (855 minutes, a completed
  // season's), xGC on xGC per game. Average is per match: his total ÷ the
  // log's matches with a figure, against each other player's total ÷ his
  // matches (every player's full log is on record for a past season, so no
  // club-matches stand-in is needed). Under the floor, no colour.
  const pastRows = pastLogSeason !== null && pastSeasons.status === "ready" ? (pastSeasons.seasons[pastLogSeason] ?? []).map(pastMatchRow) : null;
  const pastLog: MatchLog | null =
    pastRows && pastRows.length > 0
      ? (() => {
          const rows = [...pastRows].sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || b.fixtureId - a.fixtureId);
          const sums = logSums(rows);
          const totalPercentiles: Record<string, number | null> = {};
          const averagePercentiles: Record<string, number | null> = {};
          const minutes = rows.reduce((sum, r) => sum + r.minutes, 0);
          const pool = (pastSeasons.status === "ready" ? (pastSeasons.peers[pastLogSeason!] ?? []) : []).filter((p) => p.minutes >= FIXED_FLOOR_MINUTES);
          for (const [key, { peerTotal }] of Object.entries(LOG_VALUES)) {
            const total = partialTotal(sums[key]);
            const average = partialAverage(sums[key]);
            totalPercentiles[key] = null;
            averagePercentiles[key] = null;
            if (total === null || average === null || minutes < FIXED_FLOOR_MINUTES) continue;
            const higherIsBetter = LIVE_LOG_METRICS[key]?.higherIsBetter ?? true;
            const flip = (p: number | null) => (p === null ? null : higherIsBetter ? p : 100 - p);
            // A lower-is-better total grows with minutes, so it ranks per game (as live: xGC on xGC/Game).
            const rank = (t: number, mins: number) => (higherIsBetter ? t : t / Math.max(1, estimatedGamesFromMinutes(mins)));
            const peers = pool.filter((p) => p.totals[peerTotal] !== null && p.matches > 0);
            totalPercentiles[key] = flip(percentileInPool(rank(total, minutes), [rank(total, minutes), ...peers.map((p) => rank(p.totals[peerTotal]!, p.minutes))]));
            averagePercentiles[key] = flip(percentileInPool(average, [average, ...peers.map((p) => p.totals[peerTotal]! / p.matches)]));
          }
          return { rows, ...logFooter(sums), totalPercentiles, averagePercentiles };
        })()
      : null;

  const matchLog = pastLogSeason === null ? liveLog : pastLog;
  // The shown season's FPL totals: its price for the heading, and the
  // season's figures when there's no match-by-match record (before
  // 2016/17) — what the old Points History table held.
  const logSeasonTotals = logSeason === null ? null : (combinedSeasonHistory.find((s) => s.seasonName === logSeason) ?? null);
  // A past season's match record that doesn't add up to FPL's own season total (<match_record_check>).
  const recordShortfall = pastLogSeason !== null && pastRows && logSeasonTotals ? matchRecordShortfall(pastRows, logSeasonTotals) : null;
  const logPrice =
    logSeasonTotals === null
      ? null
      : pastLogSeason === null
        ? { text: fmtPrice(logSeasonTotals.endCost), title: "Price today" }
        : logSeasonTotals.startCost !== null && logSeasonTotals.endCost !== null
          ? { text: `${fmtPrice(logSeasonTotals.startCost)} → ${fmtPrice(logSeasonTotals.endCost)}`, title: "Price at the start and end of the season" }
          : null;
  // A log under the fixed floor for its season has no colours on its Totals
  // and Average, so its heading carries the small-sample marker saying why
  // (<minutes_marker>).
  const logFloor = pastLogSeason === null ? fixedFloorMinutes("live") : FIXED_FLOOR_MINUTES;
  const logMinutes = matchLog ? matchLog.rows.reduce((sum, r) => sum + r.minutes, 0) : null;
  const logSmallSampleNote =
    logMinutes !== null && logMinutes < logFloor ? `Small sample: ${fmtDecimal(logMinutes, 0)} min this season, under the ${logFloor}-minute floor: its Totals and Average have no colours.` : null;

  // A second source's columns for the shown season (Understat: his position in each match).
  const externalColumns =
    external && player.code !== null && logSeason !== null
      ? external.profiles.playerMatchColumns(player.code, logSeason).map((c) => ({ ...c, className: external.className }))
      : [];

  // A figure both sources have (Minutes, Assists, xG, xA, xGI) gets a ⇄
  // toggle on its header; switched, the whole column is the second
  // source's — each match, Totals and Average, and their colours ranked on
  // that source's figures — <one_source_per_figure>.
  const switchedKeys = new Set(switchedLog && switchedLog.playerId === player.id ? switchedLog.keys : []);
  function toggleLogSource(key: string) {
    const next = new Set(switchedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSwitchedLog({ playerId: player!.id, keys: [...next] });
  }

  function renderGwLogTable(statColumns: GwColumn[], log: MatchLog) {
    type Column = GwColumn & { total?: React.ReactNode; average?: React.ReactNode; totalTint?: string; averageTint?: string; external?: boolean; switchable?: boolean; switched?: boolean };
    const alternates =
      external && player!.code !== null && logSeason !== null
        ? external.profiles.playerMatchAlternates(player!.code, logSeason, log.rows.map((r) => ({ fixtureId: r.fixtureId, minutes: r.minutes })))
        : {};
    const fplColumn = (c: GwColumn): Column => {
      const alt = alternates[c.key];
      if (!alt) return { ...c, className: "col-source-fpl" };
      if (!switchedKeys.has(c.key)) return { ...c, className: "col-source-fpl", switchable: true };
      return {
        ...c,
        className: external!.className,
        cell: (g) => alt.cell(g.fixtureId),
        total: alt.total,
        average: alt.average,
        totalTint: alt.totalTint,
        averageTint: alt.averageTint,
        external: true,
        switchable: true,
        switched: true,
      };
    };
    const columns: Column[] = [
      ...identityColumns.map((c) => ({ ...c, className: "col-source-fpl" })),
      ...statColumns.map(fplColumn),
      ...externalColumns.map(
        (c): Column => ({
          key: c.key,
          header: c.header,
          title: c.title,
          className: c.className,
          cell: (g) => c.cell(g.fixtureId),
          total: c.total,
          average: c.average,
          totalTint: c.totalTint,
          averageTint: c.averageTint,
          external: true,
        }),
      ),
    ];
    const statStart = identityColumns.length;
    const externalStart = identityColumns.length + statColumns.length;
    const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;
    const divider = (i: number) => (i === statStart || i === externalStart) && "column-group-divider";
    return (
      <div className="table-wrap">
        <table className="data-table compact" aria-label={`${player!.name} match log`}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} className={cls(divider(i), c.className)} title={c.title} style={c.align === "left" ? { textAlign: "left" } : undefined}>
                  {c.header}
                  {c.switchable && external && <SourceToggle showingExternal={c.switched === true} externalLabel={external.label} onToggle={() => toggleLogSource(c.key)} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.rows.map((g) => (
              <tr key={g.fixtureId}>
                {columns.map((c, i) => (
                  <td key={c.key} className={cls(divider(i))} style={c.align === "left" ? { textAlign: "left", fontFamily: "var(--font-body)" } : undefined}>
                    {/* <no_minutes_no_figures>: a match FPL says he didn't play in has nothing to show — every figure "—", FPL's and the second source's, never 0. The opponent, score and result stay. */}
                    {i >= statStart && g.minutes === 0 ? DASH : c.cell(g)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="table-footer">
            {(["total", "average"] as const).map((row) => (
              <tr key={row} style={row === "total" ? { fontWeight: 600 } : undefined}>
                {columns.map((c, i) =>
                  i === 0 ? (
                    <td key={c.key} className="table-footer-label" colSpan={identityColumns.length}>
                      {row === "total" ? "Totals" : "Average"}
                    </td>
                  ) : i < identityColumns.length ? null : (
                    <td
                      key={c.key}
                      className={cls(divider(i))}
                      style={{ background: c.external ? (row === "total" ? c.totalTint : c.averageTint) : percentileTint((row === "total" ? log.totalPercentiles : log.averagePercentiles)[c.key] ?? null) }}
                    >
                      {c.external ? ((row === "total" ? c.total : c.average) ?? "") : ((row === "total" ? log.totalsByKey : log.averagesByKey)[c.key] ?? "")}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="profile-backdrop">
      <div className="profile-sheet" ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <button className="profile-close" onClick={close} type="button" title="Close" aria-label="Close">
          <CloseIcon />
        </button>

        <div className="profile-header">
          <div>
            <h2 id={headingId} style={{ marginBottom: 2 }}>{player.name}</h2>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              <PositionBadge position={player.position} /> &nbsp;{player.teamName} · {fmtPrice(player.price)} ·{" "}
              {fmtPercent(player.ownership)} owned
            </p>
          </div>
        </div>

        {player.status !== "a" && player.news && <div className="banner stale">{player.news}</div>}

        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} floorNote={profileFloorNote(analysisMode)} floorActive={underFloor} />

        {skippedByServer && (
          <div className="banner info" style={{ marginBottom: 16 }}>
            {player.name}'s historic figures couldn't be fetched from FPL this session, so this mode shows {DASH}. Points History and the
            Match Log below are unaffected.
          </div>
        )}
        {noDataForMode && (
          <div className="banner info" style={{ marginBottom: 16 }}>
            No data for {player.name} in this mode, so every field below shows {DASH}.
            {modesWithData.length > 0 && ` Try ${modesWithData.join(" or ")}.`} Points History and the Match Log below are unaffected.
          </div>
        )}

        <div className="profile-section">
          <div className="profile-section-heading col-source-fpl">
            <h3>FPL · Views</h3>
          </div>
          {/* Laid out row by row (.profile-grid): the Summary across the
              width, then the radars — a defender's or midfielder's two side
              by side, a goalkeeper's or forward's one across the width (the
              chart keeps its size, centred). The same order as the second
              source's Views: Summary, then its graphs. */}
          <div className="profile-grid">
            <ProfileSummary groups={summaryGroups} rankHint={(p) => playerRankHint(p, player.position)} badge={smallSampleBadge} />
            {radarGroups.map((group) => (
              <div className={radarGroups.length > 1 ? "card" : "card profile-span-2"} key={group.label || "combined"}>
                <div className="card-title">
                  Percentile Radar{group.label ? ` · ${group.label}` : ` · ${player.position}`}
                  {smallSampleBadge}
                </div>
                <PercentileRadarChart data={group.data} smallSample={smallSample} />
              </div>
            ))}
          </div>
        </div>

        {external && player.code !== null && (
          <div className="profile-section">
            <div className={`profile-section-heading ${external.className}`}>
              <h3>{external.label} · Views</h3>
            </div>
            <div className="profile-grid">{external.profiles.playerCards(player.code, externalView, player.position)}</div>
          </div>
        )}

        <hr className="profile-divider" />

        <div className="profile-section">
          <PointsHistoryHeader title="FPL · Points History" className="col-source-fpl" trend={history.status === "ready" ? computeSeasonTrend(history.seasonHistory) : null} />
          <div className="card">
          {history.status === "loading" && <p className="page-subtitle">Loading points history…</p>}
          {history.status === "error" && (
            <p className="page-subtitle">
              Couldn't load points history: {history.errorMessage}{" "}
              <button type="button" className="chip" onClick={history.retry} style={{ marginLeft: 4 }}>
                Retry
              </button>
            </p>
          )}
          {history.status === "ready" && combinedSeasonHistory.length === 0 && (
            <p className="page-subtitle">No season data: {player.name} doesn't appear in the FPL API before this season.</p>
          )}
          {history.status === "ready" && combinedSeasonHistory.length > 0 && historicReferenceSeason === null && (historicStatus === "idle" || historicStatus === "loading") && (
            <p className="page-subtitle">Determining the historic-average window (uses the same historic dataset as the rest of the app)…</p>
          )}
          {history.status === "ready" &&
            combinedSeasonHistory.length > 0 &&
            (historicReferenceSeason !== null || historicStatus === "error" || historicStatus === "ready") &&
            (() => {
              // The 4-season window is anchored to the pool's last completed
              // season, which only the historic dataset knows. If that failed
              // to load (the Data View toggle reports it, with Retry), the
              // seasons still show, but nothing is marked counted or not and
              // there's no average — rather than every season wrongly drawn
              // as outside the window (audit 2026-09-25 player-team-profiles M2).
              const windowKnown = historicReferenceSeason !== null;
              // Built from completed seasons only (history.seasonHistory), not
              // combinedSeasonHistory — the live/in-progress season is a real
              // bar on the chart below (drawn as an outline, via
              // PointsHistoryChart's own live handling), but averaging its partial totals in
              // alongside complete seasons would understate the average for
              // reasons that have nothing to do with an injury or bad season,
              // just the season not being over yet. The average is the
              // profile's Historic Average: only window seasons that reach
              // the fixed floor count (<fixed_minutes_floor>).
              const { floorWindowAverage: windowAverage, allSeasonsInWindow, floorSeasonsInWindow } = buildHistoricPlayerProfile(history.seasonHistory, historicReferenceSeason);
              const inWindowNames = new Set(allSeasonsInWindow.map((s) => s.seasonName));
              const countedNames = new Set(floorSeasonsInWindow.map((s) => s.seasonName));
              // Window seasons under the fixed floor: small samples, not counted (<minutes_marker>).
              const underFloorNames = new Set([...inWindowNames].filter((name) => !countedNames.has(name)));
              const underFloorNote = `Under ${FIXED_FLOOR_MINUTES} minutes this season: a small sample, not counted in the season average`;
              const orderedSeasons = [...combinedSeasonHistory].sort((a, b) => a.seasonName.localeCompare(b.seasonName));

              const seasonsCounted = windowAverage?.seasonsPlayed ?? 0;
              const averageLabel = windowKnown
                ? `Season average over ${seasonsCounted} season${seasonsCounted === 1 ? "" : "s"}: ${fmtDecimal(windowAverage?.avgPointsPerSeason ?? null, 0)} pts`
                : "Season average";

              return (
                <>
                  <PointsHistoryChart
                    seasons={orderedSeasons}
                    countedSeasonNames={windowKnown ? countedNames : null}
                    smallSampleSeasonNames={windowKnown ? underFloorNames : undefined}
                    smallSampleNote={underFloorNote}
                    currentSeasonName={currentSeasonEntry?.seasonName ?? null}
                    averagePoints={windowAverage?.avgPointsPerSeason ?? null}
                    selectedSeasonName={logSeason}
                    onSelectSeason={(season) => setPickedSeason({ playerId: player.id, season })}
                  />

                  <PointsHistoryStats
                    items={[
                      { icon: <AverageLineIcon />, value: fmtDecimal(windowAverage?.avgPointsPerSeason ?? null, 0), label: averageLabel },
                      ...(windowAverage
                        ? [
                            { icon: <ClockIcon />, value: fmtDecimal(windowAverage.avgMinutesPerSeason, 0), label: "Average minutes per season" },
                            { icon: <GoalsIcon />, value: fmtDecimal(windowAverage.avgGoalsPerSeason, 1), label: "Average goals per season" },
                            { icon: <AssistsIcon />, value: fmtDecimal(windowAverage.avgAssistsPerSeason, 1), label: "Average assists per season" },
                          ]
                        : []),
                    ]}
                  />
                </>
              );
            })()}
        </div>
        </div>

        <div className="profile-section">
          <div className={`profile-section-heading match-log-head ${externalColumns.length > 0 ? "col-source-crossover" : "col-source-fpl"}`}>
            <h3>{externalColumns.length > 0 && external ? `FPL & ${external.label}` : "FPL"} · Match Log</h3>
            <span className="match-log-season">
              {pastLogSeason ?? (liveSeasonName ? `${liveSeasonName} (current season)` : "This season")}
              {logSmallSampleNote && <SmallSampleBadge note={logSmallSampleNote} />}
            </span>
            {logPrice && (
              <span className="match-log-season num" title={logPrice.title} aria-label={`${logPrice.title}: ${logPrice.text}`}>
                {logPrice.text}
              </span>
            )}
          </div>
          <div className="card">
            {pastLogSeason === null ? (
              <>
                {history.status === "loading" && <p className="page-subtitle">Loading gameweek history…</p>}
                {history.status === "error" && (
                  <p className="page-subtitle">
                    Couldn't load this season's matches: {history.errorMessage}{" "}
                    <button type="button" className="chip" onClick={history.retry} style={{ marginLeft: 4 }}>
                      Retry
                    </button>
                  </p>
                )}
                {history.status === "ready" && history.history.length === 0 && <p className="page-subtitle">No matches played yet this season.</p>}
              </>
            ) : (
              <>
                {(pastSeasons.status === "idle" || pastSeasons.status === "loading") && <p className="page-subtitle">Loading {pastLogSeason}'s matches…</p>}
                {pastSeasons.status === "error" && (
                  <p className="page-subtitle">
                    Couldn't load {pastLogSeason}'s matches: {pastSeasons.errorMessage}{" "}
                    <button type="button" className="chip" onClick={pastSeasons.retry} style={{ marginLeft: 4 }}>
                      Retry
                    </button>
                  </p>
                )}
                {recordShortfall && (
                  <div className="banner info" style={{ marginBottom: 12 }}>
                    {pastLogSeason}'s match record adds up to {recordShortfall.recordMinutes.toLocaleString("en-GB")} minutes and{" "}
                    {recordShortfall.recordPoints} points, but FPL's season total is {recordShortfall.fplMinutes.toLocaleString("en-GB")} minutes and{" "}
                    {recordShortfall.fplPoints} points: the archive these matches come from is missing some of his season, so Totals and
                    Average below fall short of it.
                  </div>
                )}
                {pastRows !== null && pastRows.length === 0 && (
                  <>
                    <p className="page-subtitle">No match-by-match record for {pastLogSeason}: they're kept from 2016/17 on. FPL's season totals:</p>
                    {logSeasonTotals && <SeasonTotalsTable season={logSeasonTotals} />}
                  </>
                )}
              </>
            )}
            {matchLog && (
              <>
                {/* Playing Time for the season shown: minutes a match over its matches. */}
                <div className="match-log-summary">
                  <div className="card-title">Playing Time</div>
                  <PlayingTimeIcon {...computeSeasonAverageMinutes(matchLog.rows)} seasonName={pastLogSeason ?? undefined} />
                </div>
                {renderGwLogTable(primeColumns, matchLog)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
