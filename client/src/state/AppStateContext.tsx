import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchBootstrap, fetchFixtures, fetchHistoricBulk } from "../api/client";
import { describeLoadError } from "../api/errors";
import { normalizePlayers } from "../normalize/normalizePlayers";
import { normalizeTeams } from "../normalize/normalizeTeams";
import { normalizeFixtures } from "../normalize/normalizeFixtures";
import { applyRealTeamStandings } from "../normalize/deriveTeamStandings";
import { normalizeBulkHistoricData, normalizeBulkSeasonMatches } from "../normalize/normalizeElementSummary";
import { deriveGameweekState, normalizeEvents, seasonHasStarted } from "../normalize/gameweek";
import { normalizeChips } from "../normalize/normalizeChips";
import { runMetricValidation, type ValidationReport } from "../metrics/validation";
import { buildAllHistoricProfiles, type HistoricPlayerProfile } from "../metrics/historicAnalysis";
import { skippedRecordCount } from "../validation/schema";
import { liveSeasonName, rolloverSavedIds } from "./seasonIdRollover";
import { setFinishedGameweeks } from "./seasonProgress";
import type { NormalizedPlayer, NormalizedTeam, NormalizedFixture, NormalizedEvent, GameweekState, ChipWindow, PlayerSeasonHistory, ClubSeason, SeasonMatch } from "../types/normalized";
import type { AdvancedFieldAvailability } from "../normalize/fieldAvailability";

export type DataStatus = "loading" | "ready" | "error";

export type HistoricDataStatus = "idle" | "loading" | "ready" | "error";

interface AppState {
  status: DataStatus;
  errorMessage: string | null;
  isStale: boolean;
  /** Fixtures or the historic dataset served from a stale cached copy (FPL didn't answer) — flagged, never shown as current (audit 2026-10-18 M3). */
  staleDatasets: { fixtures: boolean; historic: boolean };
  /** True while the fixtures list couldn't be loaded and there's no copy to show: upcoming fixtures, Expected Points and this season's table are missing (AppShell says so). */
  fixturesUnavailable: boolean;
  lastUpdated: number | null;
  players: NormalizedPlayer[];
  teams: NormalizedTeam[];
  teamsById: Map<number, NormalizedTeam>;
  /** Whether any club has played a game this live season — the reliable signal for whether bootstrap-static's cumulative fields (points, minutes, xG, etc.) reflect the current season yet, or are still carrying last season's final totals. See metrics/resolvePlayerStats.ts. */
  currentSeasonHasStarted: boolean;
  /** Independent of the main load — a fixtures failure never blocks the rest of the app, this just stays empty. */
  fixtures: NormalizedFixture[];
  gameweekState: GameweekState | null;
  /** Every gameweek in the season, not just the current one. */
  events: NormalizedEvent[];
  /** Per-chip-type, per-half availability windows, sourced directly from bootstrap-static's top-level "chips" array — see normalize/normalizeChips.ts. Empty until data loads or if the live build ever omits this field. */
  chips: ChipWindow[];
  /** Total registered FPL managers (bootstrap-static's total_players) — null if that field is ever absent. */
  totalPlayers: number | null;
  advancedFieldAvailability: AdvancedFieldAvailability | null;
  skippedPlayerCount: number;
  /** Fixtures and club-seasons dropped for failing validation, one record at a time (audit 2026-10-18 M2), so the rest still load. Shown in the User Guide's data health. */
  skippedRecordCounts: { fixtures: number; clubSeasons: number };
  validationReport: ValidationReport | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /**
   * Counts successful loads of the live player data (the 10-minute poll and
   * Refresh Data alike); `forced` when it was Refresh Data. Lazy, per-item
   * data already on screen (an open profile's Match Log) reloads when it
   * changes, so it never lags the figures around it.
   */
  liveDataVersion: { count: number; forced: boolean };

  historicStatus: HistoricDataStatus;
  /** The season in play, e.g. "2026/27", from gameweek 1's deadline — known from the first load, unlike historicReferenceSeason. Null if FPL sent no events. */
  liveSeason: string | null;
  /** The most recently COMPLETED season, derived from the data itself — null until historicStatus is "ready". */
  historicReferenceSeason: string | null;
  historicProfiles: Map<number, HistoricPlayerProfile>;
  /** Every season in a player's history_past, unwindowed — unlike historicProfiles (capped to the last HISTORIC_WINDOW_SEASONS for recency-focused analysis elsewhere), this is the full career, oldest first, for genuine "over the years" trend charts. Empty until historic data has been loaded at least once. */
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>;
  /** Each player's matches this season (<season_matches>), oldest first: Model Predicted's chance of starting reads them. Empty until historic data has loaded; a player the build skipped has none. */
  seasonMatchesByPlayerId: Map<number, SeasonMatch[]>;
  /** Player IDs the server couldn't build historic data for (a transient upstream blip) — informational, not an error unless it's most of the pool. */
  historicSkippedPlayerIds: number[];
  /**
   * The players in historicSkippedPlayerIds the server itself couldn't fetch.
   * Only these make the live season's player-summed club figures partial:
   * the server built those from every player it fetched, including any whose
   * history the app then couldn't read (audit 2026-10-18 R3).
   */
  historicFetchSkippedPlayerIds: number[];
  /**
   * Every club's figures for every season on record, live season included
   * — the single source for every team-level figure in the app (see
   * metrics/teamStats.ts). Arrives with the same historic load as
   * historicProfiles (the server builds the live season from the same
   * per-player requests), so it's empty until historicStatus is "ready".
   */
  clubSeasons: ClubSeason[];
  historicErrorMessage: string | null;
  historicRefreshing: boolean;
  refreshHistoricData: () => void;
  /** Call from any page/component that actually needs historicProfiles/allTimeSeasonsByPlayerId (i.e. is resolving stats in a non-"live" analysisMode). Triggers the one-time whole-pool historic fetch on first real demand rather than unconditionally at app mount — safe to call on every render, a no-op after the first successful trigger. See loadHistoric below. */
  requestHistoricData: () => void;
}

const AppStateCtx = createContext<AppState | null>(null);

/** The shortest gap between two automatic rebuilds of the historic dataset (see the effect after loadHistoric). */
export const AUTO_HISTORIC_MIN_GAP_MS = 60 * 60 * 1000;

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [staleDatasets, setStaleDatasets] = useState({ fixtures: false, historic: false });
  const [fixturesUnavailable, setFixturesUnavailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [players, setPlayers] = useState<NormalizedPlayer[]>([]);
  const [teams, setTeams] = useState<NormalizedTeam[]>([]);
  const [fixtures, setFixtures] = useState<NormalizedFixture[]>([]);
  // Read by the once-created load(), which would otherwise see only the first render's list.
  const fixturesRef = useRef(fixtures);
  fixturesRef.current = fixtures;
  const [gameweekState, setGameweekState] = useState<GameweekState | null>(null);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [chips, setChips] = useState<ChipWindow[]>([]);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [advancedFieldAvailability, setAdvancedFieldAvailability] = useState<AdvancedFieldAvailability | null>(null);
  const [skippedPlayerCount, setSkippedPlayerCount] = useState(0);
  const [skippedRecordCounts, setSkippedRecordCounts] = useState({ fixtures: 0, clubSeasons: 0 });
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveDataVersion, setLiveDataVersion] = useState({ count: 0, forced: false });

  const [historicStatus, setHistoricStatus] = useState<HistoricDataStatus>("idle");
  const [liveSeason, setLiveSeason] = useState<string | null>(null);
  const [historicReferenceSeason, setHistoricReferenceSeason] = useState<string | null>(null);
  const [historicProfiles, setHistoricProfiles] = useState<Map<number, HistoricPlayerProfile>>(new Map());
  const [allTimeSeasonsByPlayerId, setAllTimeSeasonsByPlayerId] = useState<Map<number, PlayerSeasonHistory[]>>(new Map());
  const [seasonMatchesByPlayerId, setSeasonMatchesByPlayerId] = useState<Map<number, SeasonMatch[]>>(new Map());
  const [historicSkippedPlayerIds, setHistoricSkippedPlayerIds] = useState<number[]>([]);
  const [historicFetchSkippedPlayerIds, setHistoricFetchSkippedPlayerIds] = useState<number[]>([]);
  const [clubSeasons, setClubSeasons] = useState<ClubSeason[]>([]);
  const [historicErrorMessage, setHistoricErrorMessage] = useState<string | null>(null);
  const [historicRefreshing, setHistoricRefreshing] = useState(false);
  const historicRequestedRef = useRef(false);
  // The automatic historic rebuild (see the effect after loadHistoric):
  // finished fixtures now, and when the last build was asked for; whether
  // a build is running; when the last automatic one started.
  const finishedFixturesRef = useRef<number | null>(null);
  const historicBuiltForRef = useRef<number | null>(null);
  const historicInFlightRef = useRef(false);
  const historicBuiltOnceRef = useRef(false);
  const lastAutoHistoricRef = useRef(0);

  // `load` is a stable useCallback (empty deps, see below) so it can't read
  // the `players` state directly without closing over its initial `[]` —
  // this ref is kept in sync instead, so the "do we already have data to
  // fall back on" check in the catch block below sees the real current value.
  const playersRef = useRef<NormalizedPlayer[]>([]);
  // Same reasoning as playersRef, for loadHistoric's own stable useCallback below.
  const historicProfilesRef = useRef<Map<number, HistoricPlayerProfile>>(new Map());

  /**
   * `silent` is used by the background poll below — it must not flip
   * `status` to "loading" (LoadStateGate would blank the whole app behind
   * a full-screen loader every ~10 minutes) or `refreshing` (the topbar's
   * "Refresh Data" button would flash "Refreshing…" with no click behind
   * it). It still updates `lastUpdated`/`isStale`/data on success exactly
   * like a manual refresh — only the loading-state UI is suppressed.
   */
  const load = useCallback(async (forceRefresh: boolean, silent = false) => {
    if (!silent) {
      if (forceRefresh) setRefreshing(true);
      else setStatus("loading");
    }

    // Fired together, not one after the other (L8 in the Phase 1 audit) —
    // fixtures genuinely doesn't depend on bootstrap finishing first (see
    // the comment below), so starting both requests up front lets total
    // load latency be max(bootstrap, fixtures) instead of their sum. Each
    // is still awaited and error-handled independently right below.
    const bootstrapPromise = fetchBootstrap({ forceRefresh });
    const fixturesPromise = fetchFixtures({ forceRefresh });
    // Handled below once bootstrap is in; this stops a fixtures failure that
    // lands first from counting as an unhandled rejection meanwhile.
    fixturesPromise.catch(() => {});

    try {
      const result = await bootstrapPromise;
      const {
        players: normalizedPlayers,
        skippedCount,
        advancedFieldAvailability: availability,
        totalPlayers: totalPlayersCount,
      } = normalizePlayers(result.data);
      const normalizedTeams = normalizeTeams(result.data.teams);
      const gwState = deriveGameweekState(result.data.events);
      const normalizedEvents = normalizeEvents(result.data.events);
      const normalizedChips = normalizeChips(result.data.chips ?? []);
      const report = runMetricValidation(normalizedPlayers);

      // Before any page reads a saved store: if FPL has renumbered players
      // and clubs for a new season, translate every saved id first (audit
      // 2026-10-18 M6, state/seasonIdRollover.ts). Pages only mount once
      // this first load is ready; if it happens to a session already open
      // across the reset, a reload makes every page re-read the stores.
      const season = liveSeasonName(result.data.events);
      if (season) {
        const rollover = rolloverSavedIds(season, normalizedPlayers, normalizedTeams);
        if (rollover.rolledOver) {
          console.info(`Saved ids moved from ${rollover.fromSeason} to ${season}: ${rollover.droppedPlayers} player and ${rollover.droppedClubs} club reference(s) no longer in FPL were removed.`);
          if (playersRef.current.length > 0) {
            window.location.reload();
            return;
          }
        }
      }
      setLiveSeason(season);
      // Before the players: Current Season's minutes floor grows with this (<fixed_minutes_floor>).
      setFinishedGameweeks(normalizedEvents.filter((e) => e.finished).length);
      setPlayers(normalizedPlayers);
      playersRef.current = normalizedPlayers;
      setTeams(normalizedTeams);
      setGameweekState(gwState);
      setEvents(normalizedEvents);
      setChips(normalizedChips);
      setTotalPlayers(totalPlayersCount);
      setAdvancedFieldAvailability(availability);
      // Combines two distinct skip reasons into one user-facing count: records
      // dropped for failing raw schema validation (result.skippedElementCount
      // — see parseBootstrapStatic) and schema-valid records dropped for
      // referencing an unknown team/position id (skippedCount, from
      // normalizePlayers itself). See UserGuide.tsx's explanatory copy.
      setSkippedPlayerCount(skippedCount + result.skippedElementCount);
      setValidationReport(report);
      setLastUpdated(result.fetchedAt);
      setIsStale(result.source === "stale-cache");
      setStatus("ready");
      setErrorMessage(null);
      setLiveDataVersion((v) => ({ count: v.count + 1, forced: forceRefresh }));
    } catch (err) {
      const message = describeLoadError(err);

      // Only move to a hard error state if we have no data at all to fall
      // back on. If we already have data on screen, keep showing it rather
      // than blanking the app on a failed manual refresh.
      if (playersRef.current.length === 0) {
        setStatus("error");
        setErrorMessage(message);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setRefreshing(false);
    }

    // Fixtures load independently of bootstrap — used for the Team
    // Building fixture ticker. A failure here never blocks the rest of
    // the app; consumers already treat an empty fixtures list gracefully
    // (no ticker shown, nothing else depends on it). Already in flight
    // (fixturesPromise, started above alongside bootstrap) — just awaited
    // here.
    try {
      const fixturesResult = await fixturesPromise;
      const normalizedFixtures = normalizeFixtures(fixturesResult.data);
      finishedFixturesRef.current = normalizedFixtures.filter((f) => f.finished).length;
      setFixtures(normalizedFixtures);
      const skippedFixtures = skippedRecordCount(fixturesResult.data);
      if (skippedFixtures > 0) console.warn(`fixtures: ${skippedFixtures} record(s) failed validation and were skipped`);
      setSkippedRecordCounts((prev) => (prev.fixtures === skippedFixtures ? prev : { ...prev, fixtures: skippedFixtures }));
      const fixturesStale = fixturesResult.source === "stale-cache";
      setStaleDatasets((prev) => (prev.fixtures === fixturesStale ? prev : { ...prev, fixtures: fixturesStale }));
      setFixturesUnavailable(false);
    } catch (err) {
      // Not fatal: fixtures already on screen stay. With none at all, the
      // shell says what's missing (fixturesUnavailable) until a later load
      // (the 10-minute poll, or Try again) gets them.
      console.error("Fixtures failed to load:", err);
      if (fixturesRef.current.length === 0) setFixturesUnavailable(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  /**
   * Before this, bootstrap data was only ever fetched once per app launch —
   * gameweek status, players tracked, and everything else derived from it
   * would silently go stale for however long a session stayed open, only
   * correcting itself on an app restart or a manually-clicked "Refresh
   * Data" (e.g. a finished gameweek still showing as in-progress days
   * later, reported directly against the Dashboard's Gameweek Status
   * card). Polling on an interval matching the server's own
   * bootstrap-static cache TTL (`CACHE_TTL_MS.bootstrapStatic`,
   * server/src/config.ts) means every poll is likely to land on a
   * genuinely re-fetched upstream snapshot rather than re-serving the same
   * cached one, without hammering the FPL API any harder than that TTL
   * already allows. `silent` keeps this invisible — no loading screen, no
   * "Refreshing…" button state — the data just quietly catches up.
   */
  useEffect(() => {
    const POLL_INTERVAL_MS = 10 * 60 * 1000;
    const id = setInterval(() => {
      load(false, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Fetched at most once per session, shared by every page via this
  // context — never re-fetched per page. Gated behind real demand: each
  // page/component that actually resolves stats in a non-"live"
  // analysisMode calls requestHistoricData() (below) on mount, which
  // triggers this the first time any of them do so, rather than firing
  // unconditionally regardless of what the user ever views (CLAUDE.md's
  // lazy-loading rule).
  const loadHistoric = useCallback(async (forceRefresh: boolean) => {
    if (forceRefresh) setHistoricRefreshing(true);
    else setHistoricStatus("loading");
    historicInFlightRef.current = true;
    const builtFor = finishedFixturesRef.current;

    try {
      const result = await fetchHistoricBulk({ forceRefresh });
      const seasonsByPlayer = normalizeBulkHistoricData(result.data);
      const { referenceSeason, profiles } = buildAllHistoricProfiles(seasonsByPlayer);

      setHistoricReferenceSeason(referenceSeason);
      setHistoricProfiles(profiles);
      historicProfilesRef.current = profiles;
      setAllTimeSeasonsByPlayerId(seasonsByPlayer);
      setSeasonMatchesByPlayerId(normalizeBulkSeasonMatches(result.data));
      setHistoricSkippedPlayerIds(result.data.skippedPlayerIds);
      const unreadable = new Set(result.data.unreadablePlayerIds ?? []);
      if (unreadable.size > 0) console.warn(`historic-bulk: ${unreadable.size} player(s) failed validation and were left out`);
      setHistoricFetchSkippedPlayerIds(result.data.skippedPlayerIds.filter((id) => !unreadable.has(id)));
      setClubSeasons(result.data.clubSeasons ?? []);
      const skippedClubSeasons = skippedRecordCount(result.data.clubSeasons ?? []);
      if (skippedClubSeasons > 0) console.warn(`historic-bulk: ${skippedClubSeasons} club-season record(s) failed validation and were skipped`);
      setSkippedRecordCounts((prev) => (prev.clubSeasons === skippedClubSeasons ? prev : { ...prev, clubSeasons: skippedClubSeasons }));
      const historicStale = result.source === "stale-cache";
      setStaleDatasets((prev) => (prev.historic === historicStale ? prev : { ...prev, historic: historicStale }));
      setHistoricStatus("ready");
      setHistoricErrorMessage(null);
      historicBuiltForRef.current = builtFor ?? finishedFixturesRef.current;
      historicBuiltOnceRef.current = true;
    } catch (err) {
      const message = describeLoadError(err);
      if (historicProfilesRef.current.size === 0) {
        setHistoricStatus("error");
      }
      setHistoricErrorMessage(message);
    } finally {
      historicInFlightRef.current = false;
      setHistoricRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The historic dataset carries the live season's club figures (Team
   * Explorer and the Team Profile in every Data View, the live Match Logs)
   * and is otherwise built once a session, so after a match it fell behind
   * the player figures the poll keeps current. When the poll's fixtures show
   * more finished matches (bonus confirmed) than when it was last built, it
   * rebuilds — at most once an hour (AUTO_HISTORIC_MIN_GAP_MS): a build is
   * one request per player, so a match day's several kick-off windows
   * cost a few builds, not one per match. Only once something has asked
   * for the dataset; the old data stays on screen meanwhile.
   */
  useEffect(() => {
    const finished = finishedFixturesRef.current;
    const builtFor = historicBuiltForRef.current;
    if (finished === null || historicInFlightRef.current) return;
    // Built before any fixtures had loaded: this is its starting point.
    if (builtFor === null) {
      if (historicBuiltOnceRef.current) historicBuiltForRef.current = finished;
      return;
    }
    if (!historicRequestedRef.current || finished <= builtFor) return;
    if (Date.now() - lastAutoHistoricRef.current < AUTO_HISTORIC_MIN_GAP_MS) return;
    lastAutoHistoricRef.current = Date.now();
    void loadHistoric(true);
  }, [fixtures, loadHistoric]);

  const refreshHistoricData = useCallback(() => {
    if (historicRefreshing) return;
    historicRequestedRef.current = true;
    loadHistoric(true);
  }, [loadHistoric, historicRefreshing]);

  // Refresh Data refreshes everything already loaded this session. The
  // historic dataset carries the live season's club figures too (Team
  // Explorer's and the Team Profile's Current Season, league table
  // included), which otherwise stayed as they were when first loaded while
  // players and fixtures moved on (audit 2026-09-25 player-team-profiles
  // R2). Only if something has asked for it: a session that never needed
  // the historic build doesn't start one here. It runs alongside, keeping
  // the current data on screen until the new build arrives.
  const refresh = useCallback(async () => {
    if (refreshing) return; // prevent concurrent manual refreshes
    if (historicRequestedRef.current) refreshHistoricData();
    await load(true);
  }, [load, refreshing, refreshHistoricData]);

  const requestHistoricData = useCallback(() => {
    if (historicRequestedRef.current) return;
    historicRequestedRef.current = true;
    loadHistoric(false);
  }, [loadHistoric]);

  // bootstrap-static's own team.played/wins/draws/losses are confirmed
  // unreliable this season (see deriveTeamStandings.ts) — every consumer
  // of `teams`/`teamsById` gets the fixture-derived, real values instead,
  // computed once here rather than patched at each call site.
  const teamsWithRealStandings = useMemo(() => applyRealTeamStandings(teams, fixtures), [teams, fixtures]);
  const teamsById = useMemo(() => new Map(teamsWithRealStandings.map((t) => [t.id, t])), [teamsWithRealStandings]);

  // Memoized: without this, a brand-new object is created on every render
  // of this provider — which wraps the ENTIRE app — so any context state
  // update anywhere was invalidating the context value and re-rendering
  // every consumer in the whole tree, including unrelated pages/
  // components that don't even read the field that changed. Confirmed as
  // the main cause of app-wide click/typing lag (back when per-keystroke
  // filter state lived here too — it's since moved to per-page local
  // state, see state/scoutingFilters.ts, but this memoization still
  // matters for the data fields that remain).
  const value: AppState = useMemo(
    () => ({
      status,
      errorMessage,
      isStale,
      staleDatasets,
      fixturesUnavailable,
      lastUpdated,
      players,
      teams: teamsWithRealStandings,
      teamsById,
      // Real fixture results, not bootstrap-static's own (unreliable, see
      // above) team.played — true the moment any fixture has actually been
      // played and finished, current-season carryover-zeroing switches off.
      // A finished gameweek counts too, so a failed fixtures request can't
      // make a season in progress look unstarted (seasonHasStarted).
      currentSeasonHasStarted: seasonHasStarted(fixtures, events),
      fixtures,
      gameweekState,
      events,
      chips,
      totalPlayers,
      advancedFieldAvailability,
      skippedPlayerCount,
      skippedRecordCounts,
      validationReport,
      refreshing,
      refresh,
      liveDataVersion,
      historicStatus,
      liveSeason,
      historicReferenceSeason,
      historicProfiles,
      allTimeSeasonsByPlayerId,
      seasonMatchesByPlayerId,
      historicSkippedPlayerIds,
      historicFetchSkippedPlayerIds,
      clubSeasons,
      historicErrorMessage,
      historicRefreshing,
      refreshHistoricData,
      requestHistoricData,
    }),
    [
      status,
      errorMessage,
      isStale,
      staleDatasets,
      fixturesUnavailable,
      lastUpdated,
      players,
      teamsWithRealStandings,
      teamsById,
      fixtures,
      gameweekState,
      events,
      chips,
      totalPlayers,
      advancedFieldAvailability,
      skippedPlayerCount,
      skippedRecordCounts,
      validationReport,
      refreshing,
      refresh,
      liveDataVersion,
      historicStatus,
      liveSeason,
      historicReferenceSeason,
      historicProfiles,
      allTimeSeasonsByPlayerId,
      seasonMatchesByPlayerId,
      historicSkippedPlayerIds,
      historicFetchSkippedPlayerIds,
      clubSeasons,
      historicErrorMessage,
      historicRefreshing,
      refreshHistoricData,
      requestHistoricData,
    ],
  );

  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
