import { useEffect, useRef, useState } from "react";
import { fetchEntryHistory, fetchEntryPicks, fetchEventLive } from "../api/client";
import { describeLoadError } from "../api/errors";
import { scoreRecord, type LivePlayerGameweek } from "../metrics/gameweekScore";
import type { ChipWindow, NormalizedEvent, NormalizedPlayer, Position } from "../types/normalized";
import type { SavedSquad } from "../types/team";

/**
 * <gameweek_log>: how the active squad has scored, one row per gameweek
 * whose deadline has passed. An import's comes from FPL (the team's own
 * history: its points, transfers, ranks and chips, every gameweek since it
 * started); a squad built in Scoutline's is scored from its records at
 * each deadline (state/gameweekRecords.ts, scoreRecord) against FPL's
 * gameweek data, so it has no transfers or ranks. Each row also carries
 * every manager's average and highest score that gameweek. Every figure
 * is one gameweek's, never a running total (the owner's call, 2026-11-02).
 */
export interface GameweekLogRow {
  event: number;
  /** False while FPL hasn't finished the gameweek: its figures can still move. */
  finished: boolean;
  /** Points before any transfer cost. */
  points: number;
  benchPoints: number | null;
  average: number | null;
  highest: number | null;
  /** Managers ranked that gameweek, which its rank is among. */
  rankedCount: number | null;
  /** Import only, from FPL; null for a squad built here. */
  transfers: number | null;
  transferCost: number | null;
  rank: number | null;
  chip: ChipWindow["chip"] | null;
  /** A squad built here: who scored double and what he returned. An import's is loaded with the Gameweek Summary (loadImportCaptain). */
  captain: { id: number; points: number } | null;
}

export interface GameweekLog {
  status: "idle" | "loading" | "ready" | "error";
  source: "fpl" | "recorded" | null;
  rows: GameweekLogRow[];
  error: string | null;
}

const IDLE: GameweekLog = { status: "idle", source: null, rows: [], error: null };
/** A finished gameweek's data is kept for the session; one still being played is read again after this. */
const LIVE_REFRESH_MS = 10 * 60 * 1000;
const liveCache = new Map<number, { at: number; finished: boolean; data: Promise<Map<number, LivePlayerGameweek>> }>();

/** Every player's points and minutes in a gameweek (FPL's event live), kept as said above. */
export function loadEventLive(eventId: number, finished: boolean): Promise<Map<number, LivePlayerGameweek>> {
  const cached = liveCache.get(eventId);
  if (cached && (cached.finished || Date.now() - cached.at < LIVE_REFRESH_MS)) return cached.data;
  const data = fetchEventLive(eventId).then((r) => new Map(r.data.map((e) => [e.id, { points: e.stats.total_points, minutes: e.stats.minutes }])));
  liveCache.set(eventId, { at: Date.now(), finished, data });
  // A failure isn't kept: the next ask tries again.
  data.catch(() => liveCache.delete(eventId));
  return data;
}

/** For tests: forget the gameweeks read. */
export function resetEventLiveCache(): void {
  liveCache.clear();
}

/**
 * An import's captain in one gameweek from its FPL picks: whoever FPL
 * counted more than once (the vice-captain when the captain didn't play;
 * three times under Triple Captain), and his points so counted.
 */
export async function loadImportCaptain(teamId: number, event: NormalizedEvent): Promise<{ id: number; points: number } | null> {
  const [picks, live] = await Promise.all([fetchEntryPicks(teamId, event.id), loadEventLive(event.id, event.finished)]);
  const list = picks.data.picks ?? [];
  const doubled = list.find((p) => (p.multiplier ?? 0) > 1) ?? list.find((p) => p.is_captain);
  if (!doubled) return null;
  const multiplier = Math.max(2, doubled.multiplier ?? 2);
  return { id: doubled.element, points: (live.get(doubled.element)?.points ?? 0) * multiplier };
}

const CHIPS: ChipWindow["chip"][] = ["wildcard", "freehit", "bboost", "3xc"];
const asChip = (name: string | undefined) => (CHIPS.includes(name?.toLowerCase() as ChipWindow["chip"]) ? (name!.toLowerCase() as ChipWindow["chip"]) : null);

export function useGameweekLog(squad: SavedSquad | null, events: NormalizedEvent[], players: NormalizedPlayer[], liveDataCount: number): GameweekLog {
  const [log, setLog] = useState<GameweekLog>(IDLE);
  const teamId = squad?.importedFrom?.teamId ?? null;
  const records = squad && !squad.importedFrom ? squad.gameweekLog : null;
  // Re-read when the squad, its records or the live data change; the events
  // and players are read from refs, so a new array of the same data
  // (every live load makes one) doesn't start another read.
  const recordsKey = records ? JSON.stringify(records) : "";
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const playersRef = useRef(players);
  playersRef.current = players;
  const eventsKey = events.map((e) => `${e.id}:${e.finished ? 1 : 0}`).join(",");

  useEffect(() => {
    if (!squad || (teamId === null && (records?.length ?? 0) === 0)) {
      setLog(IDLE);
      return;
    }
    let cancelled = false;
    setLog((prev) => (prev.rows.length > 0 || prev.status === "loading" ? prev : { ...prev, status: "loading", error: null }));
    const eventById = new Map(eventsRef.current.map((e) => [e.id, e]));
    const now = Date.now();
    const passed = (id: number) => {
      const e = eventById.get(id);
      return !!e && Date.parse(e.deadlineTime) <= now;
    };
    const common = (id: number) => {
      const e = eventById.get(id);
      return { finished: e?.finished ?? false, average: e?.summary?.averageScore ?? null, highest: e?.summary?.highestScore ?? null, rankedCount: e?.summary?.rankedCount ?? null };
    };

    const build: Promise<GameweekLog> =
      teamId !== null
        ? fetchEntryHistory(teamId).then(({ data }) => {
            const chipByEvent = new Map((data.chips ?? []).map((c) => [c.event, asChip(c.name)]));
            const rows = (data.current ?? [])
              .filter((gw) => passed(gw.event) && typeof gw.points === "number")
              .map(
                (gw): GameweekLogRow => ({
                  event: gw.event,
                  ...common(gw.event),
                  points: gw.points as number,
                  benchPoints: gw.points_on_bench ?? null,
                  transfers: gw.event_transfers ?? null,
                  transferCost: gw.event_transfers_cost ?? null,
                  rank: gw.rank ?? null,
                  chip: chipByEvent.get(gw.event) ?? null,
                  captain: null,
                }),
              );
            return { status: "ready", source: "fpl", rows, error: null };
          })
        : (() => {
            const positionById = new Map<number, Position>(playersRef.current.map((p) => [p.id, p.position]));
            const due = records!.filter((r) => passed(r.event));
            return Promise.all(
              due.map(async (r): Promise<GameweekLogRow> => {
                const c = common(r.event);
                const live = await loadEventLive(r.event, c.finished);
                const score = scoreRecord(r, live, (id) => positionById.get(id) ?? null, c.finished);
                return {
                  event: r.event,
                  ...c,
                  points: score.points,
                  benchPoints: score.benchPoints,
                  transfers: null,
                  transferCost: null,
                  rank: null,
                  chip: null,
                  captain: score.captainId === null || score.captainPoints === null ? null : { id: score.captainId, points: score.captainPoints },
                };
              }),
            ).then((rows): GameweekLog => ({ status: "ready", source: "recorded", rows, error: null }));
          })();

    build
      .then((next) => {
        if (!cancelled) setLog({ ...next, rows: [...next.rows].sort((a, b) => b.event - a.event) });
      })
      .catch((err) => {
        if (!cancelled) setLog((prev) => ({ ...prev, status: "error", error: describeLoadError(err) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad?.id, teamId, recordsKey, eventsKey, liveDataCount]);

  return log;
}
