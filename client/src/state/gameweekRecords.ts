import type { NormalizedEvent } from "../types/normalized";
import type { GameweekRecord, SavedSquad } from "../types/team";

/**
 * <gameweek_log>: what a squad built in Scoutline looked like at each
 * deadline, so its Gameweek Log can score it. A squad's state at a
 * deadline is its state as last changed before it, so it's known exactly
 * in two moments: when the app loads (a squad unchanged since a deadline
 * still is what it was then) and just before a change (the squad being
 * changed is what it was at every deadline passed since its last change).
 * A deadline before the squad was made, or that passed while it was
 * changed and not seen in between, can't be known, so it isn't recorded.
 * An import isn't recorded: FPL keeps its history.
 *
 * Held outside React, like the minutes floor's gameweeks, so the saved
 * squads' store can record without being handed the events; AppState sets
 * them on every live load, before any page reads a squad.
 */

let deadlines: { event: number; time: number }[] = [];

export function setGameweekDeadlines(events: readonly Pick<NormalizedEvent, "id" | "deadlineTime">[]): void {
  deadlines = events.flatMap((e) => {
    const time = Date.parse(e.deadlineTime);
    return Number.isFinite(time) ? [{ event: e.id, time }] : [];
  });
}

/** The squad with every deadline passed since it last changed recorded as it stands; the same object when there's nothing to record. */
export function recordPassedDeadlines(squad: SavedSquad, now = Date.now()): SavedSquad {
  // Unknown timestamps (a squad saved before they were kept) say nothing about when it last changed.
  if (squad.importedFrom || squad.startingXI.length === 0 || squad.updatedAt <= 0 || squad.createdAt <= 0) return squad;
  const have = new Set(squad.gameweekLog.map((r) => r.event));
  const added: GameweekRecord[] = deadlines
    .filter((d) => d.time <= now && d.time > squad.updatedAt && d.time > squad.createdAt && !have.has(d.event))
    .map((d) => ({
      event: d.event,
      playerIds: [...squad.playerIds],
      startingXI: [...squad.startingXI],
      captainId: squad.captainId,
      viceCaptainId: squad.viceCaptainId,
    }));
  if (added.length === 0) return squad;
  return { ...squad, gameweekLog: [...squad.gameweekLog, ...added].sort((a, b) => a.event - b.event) };
}

/** `squad` keeping every record `recorded` has (the stored squad's, which a copy taken earlier may lack). */
export function withRecordsOf(squad: SavedSquad, recorded: SavedSquad): SavedSquad {
  const have = new Set(squad.gameweekLog.map((r) => r.event));
  const missing = recorded.gameweekLog.filter((r) => !have.has(r.event));
  if (missing.length === 0) return squad;
  return { ...squad, gameweekLog: [...squad.gameweekLog, ...missing].sort((a, b) => a.event - b.event) };
}
