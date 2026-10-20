import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEnvelope } from "../api/client";
import { useAppState } from "../state/AppStateContext";
import { ExternalStatsContext, type ExternalColumnSet, type ExternalStatsSource } from "../extensions/externalStats";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { PlayerColumn } from "../components/playerColumns";
import type { TeamColumn } from "../components/teamColumns";
import { parseUnderstatPayload, type UnderstatData } from "./schema";
import { resolveUnderstatClub, resolveUnderstatPlayer, type UsClubResolved, type UsPlayerResolved } from "./resolve";
import { UNDERSTAT_SOURCE_ID, understatPlayerColumns, understatTeamColumns } from "./columns";
import { UnderstatGuide } from "./guide";
import { understatMatchesBehind } from "./staleness";
import type { UsComparisonContext } from "./comparisons";
import { fetchClubDetail, fetchPlayerDetail, type DetailLoad, type UsClubSeasonDetail, type UsPlayerSeasonDetail } from "./profileData";
import { clubKey, createProfiles, playerKey } from "./profiles";
import { understatTrends } from "./trends";
import "./understat.css";

/**
 * Understat, mounted as the app's second data source (App.tsx — its only
 * connection to the app; see extensions/externalStats.ts). Loads
 * /api/understat once, on the first page that asks, and again every hour
 * (the sync job publishes once a day). When a check finds a newer sync, the
 * live season's profile figures already loaded are asked for again, once;
 * a completed season's never change. Switched off (data/understat/
 * control.json) it provides nothing at all: every Understat column and
 * toggle disappears, and the FPL pages are exactly as they were.
 */

const RELOAD_MS = 60 * 60 * 1000;

type Load =
  | { state: "idle" | "loading" }
  | { state: "disabled" }
  | { state: "unavailable"; message: string }
  | { state: "ready"; data: Extract<UnderstatData, { enabled: true }>; staleCopy: boolean; fetchedAt: number };

function UnderstatIcon() {
  // A goal frame with a shot in it.
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 13V4h12v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 13h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function UnderstatProvider({ children }: { children: React.ReactNode }) {
  const { players, teams, teamsById, historicProfiles, historicReferenceSeason, currentSeasonHasStarted, fixtures } = useAppState();
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const requestedRef = useRef(false);
  // The profiles' per-season detail, fetched one player or club and season at a time as a profile asks.
  const [profileLoads, setProfileLoads] = useState<ReadonlyMap<string, DetailLoad<UsPlayerSeasonDetail> | DetailLoad<UsClubSeasonDetail>>>(new Map());
  const askedRef = useRef(new Set<string>());
  // The sync the loaded data came from (status.json's generatedAt).
  const syncRef = useRef<string | null>(null);

  const requestDetail = useCallback(
    (key: string, fetcher: () => Promise<DetailLoad<UsPlayerSeasonDetail> | DetailLoad<UsClubSeasonDetail>>) => {
      if (askedRef.current.has(key)) return;
      askedRef.current.add(key);
      // Asked again after a newer sync: the figures on screen stay until the new ones arrive, or if they fail.
      setProfileLoads((prev) => (prev.get(key)?.state === "ready" ? prev : new Map(prev).set(key, { state: "loading" })));
      fetcher()
        .catch((err): DetailLoad<never> => {
          // A failed season can be asked for again (the profile re-opened).
          askedRef.current.delete(key);
          return { state: "error", message: err instanceof Error ? err.message : String(err) };
        })
        .then((result) => setProfileLoads((prev) => (result.state === "error" && prev.get(key)?.state === "ready" ? prev : new Map(prev).set(key, result))));
    },
    [],
  );
  const requestPlayerDetail = useCallback(
    (code: number, seasons: string[]) => {
      for (const s of seasons) requestDetail(playerKey(code, s), () => fetchPlayerDetail(code, s));
    },
    [requestDetail],
  );
  const requestClubDetail = useCallback(
    (code: number, seasons: string[]) => {
      for (const s of seasons) requestDetail(clubKey(code, s), () => fetchClubDetail(code, s));
    },
    [requestDetail],
  );

  const fetchData = useCallback(async () => {
    try {
      const envelope = await getEnvelope<unknown>("/api/understat");
      const data = parseUnderstatPayload(envelope.data);
      if (!data.enabled) setLoad({ state: "disabled" });
      else {
        // A newer sync: the live season's loaded profile figures are asked for again
        // (the open profiles ask when this load re-renders them) — never a completed season's.
        if (syncRef.current !== null && syncRef.current !== data.generatedAt) {
          for (const key of askedRef.current) if (key.endsWith(`:${data.liveSeason}`)) askedRef.current.delete(key);
        }
        syncRef.current = data.generatedAt;
        setLoad({ state: "ready", data, staleCopy: envelope.meta.source === "stale-cache", fetchedAt: envelope.meta.fetchedAt });
      }
    } catch (err) {
      // A reload that fails keeps the figures already on screen.
      setLoad((prev) => (prev.state === "ready" ? { ...prev, staleCopy: true } : { state: "unavailable", message: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const request = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setLoad({ state: "loading" });
    void fetchData();
  }, [fetchData]);

  // Keeps checking while switched off too, so switching Understat back on
  // (control.json) reaches a running app within the hour, not only after a
  // restart (audit 2026-10-18 L15).
  const polling = load.state !== "idle";
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void fetchData(), RELOAD_MS);
    return () => window.clearInterval(timer);
  }, [polling, fetchData]);

  const source = useMemo<ExternalStatsSource | null>(() => {
    if (load.state === "disabled") return null;
    const data = load.state === "ready" ? load.data : null;
    const playerCache = new Map<AnalysisMode, ExternalColumnSet<PlayerColumn>>();
    // What the profiles' comparative colours rank against (comparisons.ts).
    const compare: UsComparisonContext | null = data
      ? {
          seasons: data.seasons,
          liveSeason: data.liveSeason,
          positionByCode: new Map(players.filter((p) => p.code !== null).map((p) => [p.code!, p.position])),
          clubCodeByPlayerCode: new Map(
            players.flatMap((p) => {
              const clubCode = teamsById.get(p.teamId)?.code;
              return p.code !== null && clubCode != null ? [[p.code, clubCode] as [number, number]] : [];
            }),
          ),
        }
      : null;
    const teamCache = new Map<AnalysisMode, ExternalColumnSet<TeamColumn>>();

    let staleNote: string | null = null;
    if (load.state === "unavailable") staleNote = "Understat data couldn't be loaded, so its columns show —.";
    else if (load.state === "ready") {
      const behind = understatMatchesBehind(fixtures, load.data.latestMatchDate, load.data.missingFixtures, Date.now());
      if (load.staleCopy) staleNote = `Couldn't refresh Understat data — showing the copy from ${new Date(load.fetchedAt).toLocaleString("en-GB")}.`;
      else if (behind > 0) staleNote = `Understat is behind: ${behind} finished match${behind === 1 ? " isn't" : "es aren't"} in its figures yet (latest included: ${load.data.latestMatchDate ?? "—"}).`;
    }

    return {
      id: UNDERSTAT_SOURCE_ID,
      label: "Understat",
      className: "col-source-understat",
      icon: <UnderstatIcon />,
      status: load.state === "ready" ? "ready" : load.state === "unavailable" ? "unavailable" : "loading",
      staleNote,
      request,
      playerTrends: understatTrends(data),
      profiles: createProfiles(profileLoads, { player: requestPlayerDetail, club: requestClubDetail }, compare),
      guideSection: { id: "understat", navLabel: "Understat stats", title: "Understat stats", accentVar: "--col-understat", body: <UnderstatGuide /> },
      playerColumns(mode) {
        const cached = playerCache.get(mode);
        if (cached) return cached;
        const byId = new Map<number, UsPlayerResolved | null>();
        if (data) {
          for (const p of players) byId.set(p.id, resolveUnderstatPlayer(p, mode, { data, historicProfiles, currentSeasonHasStarted }));
        }
        const set = understatPlayerColumns((p) => byId.get(p.id) ?? null);
        playerCache.set(mode, set);
        return set;
      },
      teamColumns(mode) {
        const cached = teamCache.get(mode);
        if (cached) return cached;
        const byId = new Map<number, UsClubResolved | null>();
        if (data) {
          for (const t of teams) byId.set(t.id, resolveUnderstatClub(t, mode, { data, referenceSeason: historicReferenceSeason, currentSeasonHasStarted }));
        }
        const set = understatTeamColumns(teamsById, (t) => byId.get(t.id) ?? null);
        teamCache.set(mode, set);
        return set;
      },
    };
  }, [load, request, profileLoads, requestPlayerDetail, requestClubDetail, players, teams, teamsById, historicProfiles, historicReferenceSeason, currentSeasonHasStarted, fixtures]);

  return <ExternalStatsContext.Provider value={source}>{children}</ExternalStatsContext.Provider>;
}
