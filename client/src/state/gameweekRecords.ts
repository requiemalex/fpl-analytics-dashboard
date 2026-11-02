import { FREE_TRANSFER_CHIPS, nextFreeTransfers, openWindow, pendingTransfers } from "../metrics/squadTransfers";
import type { NormalizedEvent } from "../types/normalized";
import { SQUAD_RULES, type GameweekRecord, type SavedSquad } from "../types/team";

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
 * The same moments roll its transfers and chip on (<squad_transfers>,
 * <squad_chips>): at the deadline of the gameweek they're for, its
 * transfers (confirmed and pending) are counted into that gameweek's
 * record with the points past the free ones cost, its chip is spent, a
 * Free Hit puts back the squad as it was at the gameweek's start, and the
 * next gameweek opens with its free transfers by FPL's rules. A squad with
 * no transfers kept yet has unlimited ones until it has played a gameweek.
 *
 * Held outside React, like the minutes floor's gameweeks, so the saved
 * squads' store can record without being handed the events; AppState sets
 * them on every live load, before any page reads a squad.
 */

let deadlines: { event: number; time: number }[] = [];

export function setGameweekDeadlines(events: readonly Pick<NormalizedEvent, "id" | "deadlineTime">[]): void {
  deadlines = events
    .flatMap((e) => {
      const time = Date.parse(e.deadlineTime);
      return Number.isFinite(time) ? [{ event: e.id, time }] : [];
    })
    .sort((a, b) => a.time - b.time);
}

/** The gameweek whose deadline comes after `event`'s; null after the last. */
function eventAfter(event: number): number | null {
  const i = deadlines.findIndex((d) => d.event === event);
  return i === -1 ? null : (deadlines[i + 1]?.event ?? null);
}

/** The squad with every deadline passed since it last changed recorded as it stands, and its transfers rolled on; the same object when there's nothing to do. */
export function recordPassedDeadlines(squad: SavedSquad, now = Date.now()): SavedSquad {
  // Unknown timestamps (a squad saved before they were kept) say nothing about when it last changed.
  if (squad.importedFrom || squad.updatedAt <= 0 || squad.createdAt <= 0) return squad;
  const passed = deadlines.filter((d) => d.time <= now && d.time > squad.updatedAt && d.time > squad.createdAt);
  if (passed.length === 0) return squad;
  const have = new Set(squad.gameweekLog.map((r) => r.event));
  const added: GameweekRecord[] = [];
  let s = squad;
  for (const d of passed) {
    const plays = s.startingXI.length > 0;
    const current = s.transfers ?? null;
    // This deadline closes the window it's for (or one whose own deadline it missed); one for a later gameweek waits.
    const w = current !== null && current.event <= d.event ? current : null;
    const count = w ? w.made + pendingTransfers(s, w).inIds.length : 0;
    const allFree = !!w && (w.free === null || (w.chip !== null && FREE_TRANSFER_CHIPS.includes(w.chip)));
    if (plays && !have.has(d.event)) {
      have.add(d.event);
      added.push({
        event: d.event,
        playerIds: [...s.playerIds],
        startingXI: [...s.startingXI],
        captainId: s.captainId,
        viceCaptainId: s.viceCaptainId,
        ...(w
          ? {
              transfers: count,
              transferCost: allFree ? 0 : Math.max(0, count - (w.free ?? 0)) * SQUAD_RULES.hitCost,
              ...(w.chip ? { chip: w.chip } : {}),
            }
          : {}),
      });
    }
    const next = eventAfter(d.event);
    if (w) {
      let after = s;
      if (w.chip) after = { ...after, usedChips: [...after.usedChips, { chip: w.chip, event: w.event }] };
      // A Free Hit's squad lasts the one gameweek.
      if (w.chip === "freehit") after = { ...after, ...w.start, playerIds: [...w.start.playerIds], startingXI: [...w.start.startingXI], purchasePrices: { ...w.start.purchasePrices } };
      // A squad that didn't play its first gameweek keeps its unlimited transfers.
      const free = w.free === null && !plays ? null : nextFreeTransfers(w.free, count, w.chip);
      s = { ...after, transfers: next === null ? null : openWindow(after, next, free) };
    } else if (current === null && plays) {
      // Its first gameweek, played with every transfer free: one for the next.
      s = { ...s, transfers: next === null ? null : openWindow(s, next, 1) };
    }
  }
  if (added.length === 0 && s === squad) return squad;
  return { ...s, gameweekLog: [...s.gameweekLog, ...added].sort((a, b) => a.event - b.event) };
}

/** `squad` keeping every record `recorded` has (the stored squad's, which a copy taken earlier may lack). */
export function withRecordsOf(squad: SavedSquad, recorded: SavedSquad): SavedSquad {
  const have = new Set(squad.gameweekLog.map((r) => r.event));
  const missing = recorded.gameweekLog.filter((r) => !have.has(r.event));
  if (missing.length === 0) return squad;
  return { ...squad, gameweekLog: [...squad.gameweekLog, ...missing].sort((a, b) => a.event - b.event) };
}

/**
 * A change (`squad`, made to a copy read earlier) applied over the stored
 * squad (`stored`) once its deadlines are recorded (`rolled`): the change
 * keeps every record, and if a deadline rolled the transfers on since the
 * copy was read, the rolled transfers and chips win (the change was made
 * for a gameweek now closed). A Free Hit that put the squad back since
 * wins outright: the change was to the Free Hit's squad.
 */
export function withDeadlinesOf(squad: SavedSquad, rolled: SavedSquad, stored: SavedSquad): SavedSquad {
  const merged = withRecordsOf(squad, rolled);
  if ((rolled.transfers ?? null) === (stored.transfers ?? null)) return merged;
  if (rolled.playerIds !== stored.playerIds) return rolled;
  return { ...merged, transfers: rolled.transfers, usedChips: rolled.usedChips };
}
