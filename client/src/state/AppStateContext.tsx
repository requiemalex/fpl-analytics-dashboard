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
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { SchemaValidationError } from "../validation/schema";
import type { NormalizedPlayer, NormalizedTeam, NormalizedFixture, NormalizedEvent, GameweekState, ChipWindow, PlayerSeasonHistory } from "../types/normalized";
import type { AdvancedFieldAvailability } from "../normalize/fieldAvailability";
import type { ArchetypeLabel } from "../metrics/archetypes";

export type DataStatus = "loading" | "ready" | "error";

export interface GlobalScoutingFilters {
  search: string;
  position: "ALL" | "GKP" | "DEF" | "MID" | "FWD";
  teamId: number | "ALL";
  minMinutes: number;
  /** Empty array = no archetype filter applied. Any-of match when non-empty. */
  archetypes: ArchetypeLabel[];
}

const DEFAULT_MIN_MINUTES = 450;

const DEFAULT_FILTERS: GlobalScoutingFilters = {
  search: "",
  position: "ALL",
  teamId: "ALL",
  minMinutes: DEFAULT_MIN_MINUTES,
  archetypes: [],
};

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
  filters: GlobalScoutingFilters;
  setFilters: React.Dispatch<React.SetStateAction<GlobalScoutingFilters>>;
  resetFilters: () => void;

  /**
   * Which season's data "the player" means across most of the app. Kept
   * global (not per-page) so switching it anywhere is consistent
   * everywhere — see metrics/resolvePlayerStats.ts.
   */
  analysisMode: AnalysisMode;
  /** Lazily triggers the historic bulk load the first time it's needed — a no-op if already loading/loaded. */
  setAnalysisMode: (mode: AnalysisMode) => void;
  historicStatus: HistoricDataStatus;
  /** The most recently COMPLETED season, derived from the data itself — null until historicStatus is "ready". */
  historicReferenceSeason: string | null;
  historicProfiles: Map<number, HistoricPlayerProfile>;
  /** Every season in a player's history_past, unwindowed — unlike historicProfiles (capped to the last HISTORIC_WINDOW_SEASONS for recency-focused analysis elsewhere), this is the full career, oldest first, for genuine "over the years" trend charts. Empty until historic data has been loaded at least once. */
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>;
  /** Player IDs the server couldn't build historic data for (a transient upstream blip) — informational, not an error unless it's most of the pool. */
  historicSkippedPlayerIds: number[];
  historicErrorMessage: string | null;
  historicRefreshing: boolean;
  refreshHistoricData: () => void;
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
  const [filters, setFilters] = useState<GlobalScoutingFilters>(DEFAULT_FILTERS);

  const [analysisMode, setAnalysisModeState] = useState<AnalysisMode>("lastSeason");
  const [historicStatus, setHistoricStatus] = useState<HistoricDataStatus>("idle");
  const [historicReferenceSeason, setHistoricReferenceSeason] = useState<string | null>(null);
  const [historicProfiles, setHistoricProfiles] = useState<Map<number, HistoricPlayerProfile>>(new Map());
  const [allTimeSeasonsByPlayerId, setAllTimeSeasonsByPlayerId] = useState<Map<number, PlayerSeasonHistory[]>>(new Map());
  const [historicSkippedPlayerIds, setHistoricSkippedPlayerIds] = useState<number[]>([]);
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

  const load = useCallback(async (forceRefresh: boolean) => {
    if (forceRefresh) setRefreshing(true);
    else setStatus("loading");

    try {
      const result = await fetchBootstrap({ forceRefresh });
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
      setSkippedPlayerCount(skippedCount);
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
    // (no ticker shown, nothing else depends on it).
    try {
      const fixturesResult = await fetchFixtures({ forceRefresh });
      setFixtures(normalizeFixtures(fixturesResult.data));
    } catch {
      // leave fixtures as-is (empty on first failure) — not fatal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    if (refreshing) return; // prevent concurrent manual refreshes
    await load(true);
  }, [load, refreshing]);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  // Loaded lazily — the first time any page actually needs historic data
  // (switching analysisMode away from "live") — rather than blocking the
  // whole app behind a cold build that costs the server several hundred
  // upstream requests. Once loaded, it's shared by every consumer via
  // this context, never re-fetched per page.
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

  const setAnalysisMode = useCallback(
    (mode: AnalysisMode) => {
      setAnalysisModeState(mode);
      if (mode !== "live" && !historicRequestedRef.current) {
        historicRequestedRef.current = true;
        loadHistoric(false);
      }
    },
    [loadHistoric],
  );

  const refreshHistoricData = useCallback(() => {
    if (historicRefreshing) return;
    historicRequestedRef.current = true;
    loadHistoric(true);
  }, [loadHistoric, historicRefreshing]);

  // The default analysisMode is "lastSeason", not "live" — live-season
  // bootstrap data is empty before a season's first gameweek, so the app
  // would otherwise open on an all-zero view. This mirrors the manual
  // trigger in setAnalysisMode for that "already non-live at mount" case.
  useEffect(() => {
    if (analysisMode !== "live" && !historicRequestedRef.current) {
      historicRequestedRef.current = true;
      loadHistoric(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bootstrap-static's own team.played/wins/draws/losses are confirmed
  // unreliable this season (see deriveTeamStandings.ts) — every consumer
  // of `teams`/`teamsById` gets the fixture-derived, real values instead,
  // computed once here rather than patched at each call site.
  const teamsWithRealStandings = useMemo(() => applyRealTeamStandings(teams, fixtures), [teams, fixtures]);
  const teamsById = useMemo(() => new Map(teamsWithRealStandings.map((t) => [t.id, t])), [teamsWithRealStandings]);

  const value: AppState = {
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
    filters,
    setFilters,
    resetFilters,
    analysisMode,
    setAnalysisMode,
    historicStatus,
    historicReferenceSeason,
    historicProfiles,
    allTimeSeasonsByPlayerId,
    historicSkippedPlayerIds,
    historicErrorMessage,
    historicRefreshing,
    refreshHistoricData,
  };

  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
