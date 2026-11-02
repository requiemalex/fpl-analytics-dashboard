import type { ChipWindow } from "../types/normalized";
import type { RawEntryHistory } from "../types/raw";
import { SQUAD_RULES, snapshotOf, type ChipName, type SavedSquad, type TransferWindow, type UsedChip } from "../types/team";

/**
 * <squad_transfers>: a squad's transfers for the gameweek open for picks,
 * and <squad_chips>: its chips. FPL's rules, as its own game plays them
 * (2026/27): a team's first gameweek has unlimited transfers; after it,
 * one free transfer a gameweek, unused ones banked up to five
 * (SQUAD_RULES.maxFreeTransfers); each transfer past them costs four
 * points (SQUAD_RULES.hitCost). A Wildcard or Free Hit makes the
 * gameweek's transfers free and keeps the bank as it was, adding none.
 * One chip a gameweek, each once per half of the season (its window, from
 * bootstrap's `chips`), and no Free Hit the gameweek after one.
 */

/** The chips that make a gameweek's transfers free. */
export const FREE_TRANSFER_CHIPS: readonly ChipName[] = ["wildcard", "freehit"];

/** Players bought since the window's base (the deadline or the last confirm), and those sold. */
export function pendingTransfers(squad: Pick<SavedSquad, "playerIds">, window: Pick<TransferWindow, "baseIds">): { inIds: number[]; outIds: number[] } {
  const base = new Set(window.baseIds);
  const now = new Set(squad.playerIds);
  return { inIds: squad.playerIds.filter((id) => !base.has(id)), outIds: window.baseIds.filter((id) => !now.has(id)) };
}

/** Why a gameweek's transfers are free: a squad's first gameweek, or a chip. */
export type FreeBecause = "first" | "wildcard" | "freehit" | null;

export interface TransferStanding {
  event: number;
  /** Free transfers at the gameweek's start; null when every transfer is free (`freeBecause` says why). */
  free: number | null;
  freeBecause: FreeBecause;
  /** The window's own free transfers, whatever a chip makes of them (null: unlimited): what a squad built here's are set to. */
  banked: number | null;
  made: number;
  /** Bought since the last confirm, and sold. */
  inIds: number[];
  outIds: number[];
  /** Every transfer this gameweek: confirmed and pending. */
  count: number;
  /** Free transfers still to use; null when unlimited. */
  left: number | null;
  /** Transfers past the free ones, and the points they cost. */
  extra: number;
  cost: number;
}

/** Where the squad's transfers stand for `event` (the gameweek open for picks); null when its window is for another gameweek (out of date until the deadline's rollover or an import's update). */
export function transferStanding(squad: Pick<SavedSquad, "playerIds" | "transfers">, event: number | null): TransferStanding | null {
  if (event === null) return null;
  const w = squad.transfers;
  if (w !== null && w.event !== event) return null;
  // No window yet: a squad built here before its first gameweek, every transfer free.
  if (w === null) return { event, free: null, freeBecause: "first", banked: null, made: 0, inIds: [], outIds: [], count: 0, left: null, extra: 0, cost: 0 };
  const { inIds, outIds } = pendingTransfers(squad, w);
  const count = w.made + inIds.length;
  const freeBecause: FreeBecause = w.free === null ? "first" : w.chip === "wildcard" || w.chip === "freehit" ? w.chip : null;
  const free = freeBecause ? null : w.free;
  const extra = free === null ? 0 : Math.max(0, count - free);
  return { event, free, freeBecause, banked: w.free, made: w.made, inIds, outIds, count, left: free === null ? null : Math.max(0, free - count), extra, cost: extra * SQUAD_RULES.hitCost };
}

/**
 * The next gameweek's free transfers, from this one's: after a first
 * gameweek (unlimited), one; after a Wildcard or Free Hit, the bank as it
 * was; otherwise those left, plus one, up to the cap.
 */
export function nextFreeTransfers(free: number | null, count: number, chip: ChipName | null): number {
  if (free === null) return 1;
  if (chip && FREE_TRANSFER_CHIPS.includes(chip)) return free;
  return Math.min(SQUAD_RULES.maxFreeTransfers, Math.max(0, free - count) + 1);
}

/**
 * <squad_transfers> for an import: the free transfers its next gameweek
 * starts with, from FPL's history of the team (`entry/{id}/history/`, every
 * gameweek since it started, and the chips it played). FPL's public data
 * doesn't send the figure, so it's FPL's rules played through the team's
 * own transfers. Each gameweek's history corrects the count where it says
 * more: a hit means the free ones were the transfers less the hits, and
 * more transfers than counted with no hit means at least that many were
 * free (an extra FPL gave everyone, say). Null before its first gameweek
 * (unlimited).
 */
export function freeTransfersFromHistory(history: RawEntryHistory): number | null {
  const chipByEvent = new Map((history.chips ?? []).map((c) => [c.event, c.name.toLowerCase()]));
  const rows = [...(history.current ?? [])].sort((a, b) => a.event - b.event);
  let free: number | null = null;
  for (const row of rows) {
    // Its first gameweek: unlimited.
    if (free === null) {
      free = 1;
      continue;
    }
    const chip = chipByEvent.get(row.event);
    if (chip === "wildcard" || chip === "freehit") continue;
    const transfers = row.event_transfers ?? 0;
    const cost = row.event_transfers_cost ?? 0;
    const had = cost > 0 ? transfers - cost / SQUAD_RULES.hitCost : Math.max(free, transfers);
    free = Math.min(SQUAD_RULES.maxFreeTransfers, Math.max(0, had - transfers) + 1);
  }
  return free;
}

/** A window for `event` starting from the squad as it stands, with `free` transfers (null: unlimited). */
export function openWindow(squad: SavedSquad, event: number, free: number | null): TransferWindow {
  return { event, free, made: 0, baseIds: [...squad.playerIds], start: snapshotOf(squad), chip: null };
}

/** Confirms the pending transfers: they count as made, and the squad as it stands is the new base. */
export function confirmTransfers(squad: SavedSquad): SavedSquad {
  const w = squad.transfers;
  if (!w) return squad;
  const { inIds, outIds } = pendingTransfers(squad, w);
  if (inIds.length === 0 && outIds.length === 0) return squad;
  return { ...squad, transfers: { ...w, made: w.made + inIds.length, baseIds: [...squad.playerIds] } };
}

/**
 * Sets the free transfers a squad built here has for `event` (null:
 * unlimited): tracking starts from the squad as it stands, nothing made
 * yet. Its chip for the gameweek, and what a Free Hit would put back, stay.
 */
export function setFreeTransfers(squad: SavedSquad, event: number, free: number | null): SavedSquad {
  const w = squad.transfers?.event === event ? squad.transfers : null;
  return { ...squad, transfers: { ...openWindow(squad, event, free), start: w?.start ?? snapshotOf(squad), chip: w?.chip ?? null } };
}

/** Plays `chip` for `event`, or cancels the one played (null). A squad with no window yet gets one, its transfers still unlimited. */
export function playChip(squad: SavedSquad, event: number, chip: ChipName | null): SavedSquad {
  const w = squad.transfers?.event === event ? squad.transfers : openWindow(squad, event, null);
  return { ...squad, transfers: { ...w, chip } };
}

export interface ChipStatus {
  chip: ChipName;
  /** The window (half of the season) `event` falls in; null when the chip can't be played then. */
  window: ChipWindow | null;
  /** How it was spent in that window, if it was. */
  used: UsedChip | null;
  /** Played for `event`. */
  playing: boolean;
  /** Why it can't be played for `event`; null when it can (or is being). */
  blocked: string | null;
}

const CHIP_ORDER: ChipName[] = ["wildcard", "freehit", "bboost", "3xc"];
const CHIP_LABEL: Record<ChipName, string> = { wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain" };

/** Whether `used` falls in `window`: played in one of its gameweeks, or marked used by hand for its half. */
function inWindow(used: UsedChip, window: ChipWindow): boolean {
  return used.event !== null ? used.event >= window.startEvent && used.event <= window.stopEvent : used.half === window.half;
}

/** Each chip for `event`: its window, whether it's spent there, played, or can be. */
export function chipStatuses(usedChips: readonly UsedChip[], windows: readonly ChipWindow[], event: number | null, playing: ChipName | null): ChipStatus[] {
  return CHIP_ORDER.map((chip) => {
    const window = event === null ? null : (windows.find((w) => w.chip === chip && w.startEvent <= event && event <= w.stopEvent) ?? null);
    const used = window ? (usedChips.find((u) => u.chip === chip && inWindow(u, window)) ?? null) : null;
    const isPlaying = playing === chip;
    let blocked: string | null = null;
    if (!isPlaying) {
      if (event === null) blocked = "No gameweek left to play it in";
      else if (!window) blocked = `Can't be played in GW${event}`;
      else if (used) blocked = used.event !== null ? `Played in GW${used.event}` : "Marked used this half of the season";
      else if (playing) blocked = `${CHIP_LABEL[playing]} is being played in GW${event}: one chip a gameweek`;
      else if (chip === "freehit" && usedChips.some((u) => u.chip === "freehit" && u.event === event - 1)) blocked = "A Free Hit was played the gameweek before: never two in a row";
    }
    return { chip, window, used, playing: isPlaying, blocked };
  });
}
