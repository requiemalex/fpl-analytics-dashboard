import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchBootstrap, fetchFixtures, fetchHistoricBulk, ApiRequestError } from "../api/client";
import { normalizePlayers } from "../normalize/normalizePlayers";
import { normalizeTeams } from "../normalize/normalizeTeams";
import { normalizeFixtures } from "../normalize/normalizeFixtures";
import { applyRealTeamStandings } from "../normalize/deriveTeamStandings";
import { normalizeBulkHistoricData } from "../normalize/normalizeElementSummary";
import { deriveGameweekState, normalizeEvents } from "../normalize/gameweek";
import { normalizeChips } from "../normalize/normalizeChips";
import { runMetricValidation, type ValidationReport } from "../metrics/validation";
import { buildAllHistoricProfiles, type HistoricPlayerProfile } from "../metrics/historicAnalysis";
import { SchemaValidationError } from "../validation/schema";
import type { NormalizedPlayer, NormalizedTeam, NormalizedFixture, NormalizedEvent, GameweekState, ChipWindow, PlayerSeasonHistory, ClubSeason } from "../types/normalized";
import type { AdvancedFieldAvailability } from "../normalize/fieldAvailability";

export type DataStatus = "loading" | "ready" | "error";

export type HistoricDataStatus = "idle" | "loading" | "ready" | "error";

interface AppState {
  status: DataStatus;
  errorMessage: string | null;
  isStale: boolean;
  lastUpdated: number | null;
  players: NormalizedPlayer[];
  teams: NormalizedTeam[];
  teamsById: Map<number, NormalizedTeam>;
  /** Whether any club has played a game this live season — the reliable signal for whether bootstrap-static's cumulative fields (points, minutes, xG, etc.) reflect the current season yet, or are still carrying last season's final totals. See metrics/resolvePlayerStats.ts. */
  currentSeasonHasStarted: boolean;
  /** Independent of the main load — a fixtures failure never blocks the rest of the app, this just stays empty. */
  fixtures: NormalizedFixture[];
  gameweekState: GameweekState | null;
  /** Every gameweek in the season, not just the current one — used by the Chip Planner to walk deadlines through to the end of the season. */
  events: NormalizedEvent[];
  /** Per-chip-type, per-half availability windows, sourced directly from bootstrap-static's top-level "chips" array — see normalize/normalizeChips.ts. Empty until data loads or if the live build ever omits this field. */
  chips: ChipWindow[];
  /** Total registered FPL managers (bootstrap-static's total_players) — null if that field is ever absent. */
  totalPlayers: number | null;
  advancedFieldAvailability: AdvancedFieldAvailability | null;
  skippedPlayerCount: number;
  validationReport: ValidationReport | null;
  refreshing: boolean;
  refresh: () => Promise<void>;

  historicStatus: HistoricDataStatus;
  /** The most recently COMPLETED season, derived from the data itself — null until historicStatus is "ready". */
  historicReferenceSeason: string | null;
  historicProfiles: Map<number, HistoricPlayerProfile>;
  /** Every season in a player's history_past, unwindowed — unlike historicProfiles (capped to the last HISTORIC_WINDOW_SEASONS for recency-focused analysis elsewhere), this is the full career, oldest first, for genuine "over the years" trend charts. Empty until historic data has been loaded at least once. */
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>;
  /** Player IDs the server couldn't build historic data for (a transient upstream blip) — informational, not an error unless it's most of the pool. */
  historicSkippedPlayerIds: number[];
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

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [players, setPlayers] = useState<NormalizedPlayer[]>([]);
  const [teams, setTeams] = useState<NormalizedTeam[]>([]);
  const [fixtures, setFixtures] = useState<NormalizedFixture[]>([]);
  const [gameweekState, setGameweekState] = useState<GameweekState | null>(null);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [chips, setChips] = useState<ChipWindow[]>([]);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [advancedFieldAvailability, setAdvancedFieldAvailability] = useState<AdvancedFieldAvailability | null>(null);
  const [skippedPlayerCount, setSkippedPlayerCount] = useState(0);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [historicStatus, setHistoricStatus] = useState<HistoricDataStatus>("idle");
  const [historicReferenceSeason, setHistoricReferenceSeason] = useState<string | null>(null);
  const [historicProfiles, setHistoricProfiles] = useState<Map<number, HistoricPlayerProfile>>(new Map());
  const [allTimeSeasonsByPlayerId, setAllTimeSeasonsByPlayerId] = useState<Map<number, PlayerSeasonHistory[]>>(new Map());
  const [historicSkippedPlayerIds, setHistoricSkippedPlayerIds] = useState<number[]>([]);
  const [clubSeasons, setClubSeasons] = useState<ClubSeason[]>([]);
  const [historicErrorMessage, setHistoricErrorMessage] = useState<string | null>(null);
  const [historicRefreshing, setHistoricRefreshing] = useState(false);
  const historicRequestedRef = useRef(false);

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
    } catch (err) {
      const message =
        err instanceof SchemaValidationError
          ? err.message
          : err instanceof ApiRequestError
            ? err.message
            : `Unexpected error loading FPL data: ${(err as Error).message}`;

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
      setFixtures(normalizeFixtures(fixturesResult.data));
    } catch {
      // leave fixtures as-is (empty on first failure) — not fatal.
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

  const refresh = useCallback(async () => {
    if (refreshing) return; // prevent concurrent manual refreshes
    await load(true);
  }, [load, refreshing]);

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

    try {
      const result = await fetchHistoricBulk({ forceRefresh });
      const seasonsByPlayer = normalizeBulkHistoricData(result.data);
      const { referenceSeason, profiles } = buildAllHistoricProfiles(seasonsByPlayer);

      setHistoricReferenceSeason(referenceSeason);
      setHistoricProfiles(profiles);
      historicProfilesRef.current = profiles;
      setAllTimeSeasonsByPlayerId(seasonsByPlayer);
      setHistoricSkippedPlayerIds(result.data.skippedPlayerIds);
      setClubSeasons(result.data.clubSeasons ?? []);
      setHistoricStatus("ready");
      setHistoricErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof SchemaValidationError
          ? err.message
          : err instanceof ApiRequestError
            ? err.message
            : `Unexpected error loading historic data: ${(err as Error).message}`;
      if (historicProfilesRef.current.size === 0) {
        setHistoricStatus("error");
      }
      setHistoricErrorMessage(message);
    } finally {
      setHistoricRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistoricData = useCallback(() => {
    if (historicRefreshing) return;
    historicRequestedRef.current = true;
    loadHistoric(true);
  }, [loadHistoric, historicRefreshing]);

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
      lastUpdated,
      players,
      teams: teamsWithRealStandings,
      teamsById,
      // Real fixture results, not bootstrap-static's own (unreliable, see
      // above) team.played — true the moment any fixture has actually been
      // played and finished, current-season carryover-zeroing switches off.
      currentSeasonHasStarted: fixtures.some((f) => f.finished),
      fixtures,
      gameweekState,
      events,
      chips,
      totalPlayers,
      advancedFieldAvailability,
      skippedPlayerCount,
      validationReport,
      refreshing,
      refresh,
      historicStatus,
      historicReferenceSeason,
      historicProfiles,
      allTimeSeasonsByPlayerId,
      historicSkippedPlayerIds,
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
      validationReport,
      refreshing,
      refresh,
      historicStatus,
      historicReferenceSeason,
      historicProfiles,
      allTimeSeasonsByPlayerId,
      historicSkippedPlayerIds,
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
