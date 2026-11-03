import { useCallback, useEffect } from "react";
import { KNOWN_CHIPS } from "../normalize/normalizeChips";
import type { ChipName, GameweekRecord, SavedSquad, SquadSnapshot, TransferWindow, UsedChip } from "../types/team";
import { recordPassedDeadlines, withDeadlinesOf } from "./gameweekRecords";
import { loadVersioned, mapReadableEntries, saveVersioned, type VersionedStore, usePersistentState } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";
/**
 * 2: an import's `importedFrom.budget` (<imported_budget>); a version-1 import gets null, so the £100m it had still applies.
 * 3: `purchasePrices` (<purchase_prices>); an earlier squad gets none, so its purchase and selling prices show "—" until it's imported again or a player is re-added.
 * 4: an import's `importedFrom.playerIds` and `importedFrom.purchasePrices` (<imported_budget>); an earlier import gets null for both, and Team Building loads them from FPL the next time it's opened.
 * 5: `gameweekLog` (<gameweek_log>); an earlier squad gets none, and the deadlines passed since it was last changed are recorded the next time the app loads.
 * 6: `transfers` (<squad_transfers>, <squad_chips>), a record's transfers, hits and chip, and a chip marked used by hand's `half`; an earlier squad gets none: one built here has unlimited transfers until it plays a gameweek or they're set, an import's are read from FPL the next time it's opened.
 */
const STORAGE_VERSION = 6;

/** <active_squad>: the squad Team Building last had open, kept the way the Dashboard and Player Comparison keep their picked view. */
const ACTIVE_SQUAD_STORAGE_KEY = "fpl-dashboard:saved-squads:active:v1";
const ACTIVE_SQUAD_STORE: VersionedStore<string | null> = {
  version: 1,
  fallback: null,
  migrate: (data) => (typeof data === "string" ? data : null),
};

/** The remembered active squad's id; one no longer saved falls back to the first squad where it's read. */
export function useActiveSquadId() {
  return usePersistentState(ACTIVE_SQUAD_STORAGE_KEY, ACTIVE_SQUAD_STORE);
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((id): id is number => typeof id === "number" && Number.isFinite(id)) : []);
const idOrNull = (v: unknown, allowed: number[]): number | null => (typeof v === "number" && allowed.includes(v) ? v : null);

/**
 * Brings one stored squad to the current shape, repairing what it can so
 * Team Building never meets a squad it can't draw (audit 2026-10-18 M8: a
 * squad with no `playerIds` blanked the page). Player lists keep only
 * numbers; the starting XI and the armbands keep only players in the squad.
 * A squad saved before usedChips/importedFrom existed gets them defaulted
 * in, as before. Null (skipped) without an id, since nothing can select it.
 * `storedVersion` is the store version it was saved under (null before the
 * store had one), so each step applies only to the versions it was written for.
 */
export function normalizeSavedSquad(raw: Record<string, unknown>, storedVersion: number | null = STORAGE_VERSION): SavedSquad | null {
  if (typeof raw.id !== "string" || raw.id === "") return null;
  const playerIds = [...new Set(ids(raw.playerIds))];
  const startingXI = [...new Set(ids(raw.startingXI))].filter((id) => playerIds.includes(id));
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "Squad",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    playerIds,
    startingXI,
    captainId: idOrNull(raw.captainId, startingXI),
    viceCaptainId: idOrNull(raw.viceCaptainId, startingXI),
    purchasePrices: normalizePurchasePrices(raw.purchasePrices, playerIds),
    usedChips: normalizeUsedChips(raw.usedChips, storedVersion),
    transfers: normalizeTransfers(raw.transfers),
    gameweekLog: normalizeGameweekLog(raw.gameweekLog),
    importedFrom: normalizeImportedFrom(raw.importedFrom),
  };
}

/** <gameweek_log>: each record checked, one per gameweek, in gameweek order; none for a squad saved before version 5. */
function normalizeGameweekLog(raw: unknown): GameweekRecord[] {
  if (!Array.isArray(raw)) return [];
  const byEvent = new Map<number, GameweekRecord>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    if (typeof rec.event !== "number" || !Number.isInteger(rec.event) || byEvent.has(rec.event)) continue;
    const playerIds = [...new Set(ids(rec.playerIds))];
    const startingXI = [...new Set(ids(rec.startingXI))].filter((id) => playerIds.includes(id));
    const record: GameweekRecord = { event: rec.event, playerIds, startingXI, captainId: idOrNull(rec.captainId, startingXI), viceCaptainId: idOrNull(rec.viceCaptainId, startingXI) };
    // <squad_transfers>: a record from version 6 on may carry its gameweek's transfers, hits and chip.
    const transfers = count(rec.transfers);
    const transferCost = count(rec.transferCost);
    if (transfers !== null && transferCost !== null) Object.assign(record, { transfers, transferCost });
    const chip = chipOrNull(rec.chip);
    if (chip) record.chip = chip;
    byEvent.set(rec.event, record);
  }
  return [...byEvent.values()].sort((a, b) => a.event - b.event);
}

/** A whole number of 0 or more, else null. */
const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const chipOrNull = (v: unknown): ChipName | null => (typeof v === "string" && KNOWN_CHIPS.includes(v as ChipName) ? (v as ChipName) : null);

/**
 * <squad_chips>: each spent chip a known chip with a gameweek or, marked used
 * by hand, a half. A chip marked used by hand before halves were kept
 * (version 5 and earlier) has neither, and is kept as it was saved, its half
 * unknown, rather than dropped (audit 2026-11-03 L9); from version 6 one
 * without either can't be read.
 */
function normalizeUsedChips(raw: unknown, storedVersion: number | null): UsedChip[] {
  const beforeHalves = storedVersion === null || storedVersion < 6;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((u): UsedChip[] => {
    if (!u || typeof u !== "object") return [];
    const r = u as Record<string, unknown>;
    const chip = chipOrNull(r.chip);
    if (!chip) return [];
    const event = typeof r.event === "number" && Number.isInteger(r.event) ? r.event : null;
    const half = r.half === 1 || r.half === 2 ? r.half : undefined;
    if (event === null && half === undefined) return beforeHalves ? [{ chip, event }] : [];
    return [half === undefined ? { chip, event } : { chip, event, half }];
  });
}

/** <squad_transfers>: the window checked field by field; null (none kept yet) when it can't be read, as before version 6. */
function normalizeTransfers(raw: unknown): TransferWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const event = count(r.event);
  const made = count(r.made);
  if (event === null || made === null || !r.start || typeof r.start !== "object") return null;
  const free = r.free === null ? null : count(r.free);
  if (free === null && r.free !== null) return null;
  const st = r.start as Record<string, unknown>;
  const startIds = [...new Set(ids(st.playerIds))];
  const startXI = [...new Set(ids(st.startingXI))].filter((id) => startIds.includes(id));
  const start: SquadSnapshot = {
    playerIds: startIds,
    startingXI: startXI,
    captainId: idOrNull(st.captainId, startXI),
    viceCaptainId: idOrNull(st.viceCaptainId, startXI),
    purchasePrices: normalizePurchasePrices(st.purchasePrices, startIds),
  };
  return { event, free, made, baseIds: [...new Set(ids(r.baseIds))], start, chip: chipOrNull(r.chip) };
}

const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Purchase prices kept only for players in the squad, each a real positive price; none for a squad saved before they were kept (version 2 and earlier). */
function normalizePurchasePrices(raw: unknown, playerIds: number[]): Record<number, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    const price = numberOrNull(value);
    if (playerIds.includes(id) && price !== null && price > 0) out[id] = price;
  }
  return out;
}

/** An import's record, with each field checked; null without the team id it names. `budget` is null where it wasn't saved (version 1). */
function normalizeImportedFrom(raw: unknown): SavedSquad["importedFrom"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const teamId = numberOrNull(r.teamId);
  if (teamId === null) return null;
  return {
    teamId,
    teamName: typeof r.teamName === "string" ? r.teamName : "",
    managerName: typeof r.managerName === "string" ? r.managerName : "",
    asOfEvent: numberOrNull(r.asOfEvent) ?? 0,
    bank: numberOrNull(r.bank),
    budget: numberOrNull(r.budget),
    playerIds: Array.isArray(r.playerIds) ? [...new Set(ids(r.playerIds))] : null,
    purchasePrices: r.purchasePrices && typeof r.purchasePrices === "object" && Array.isArray(r.playerIds) ? normalizePurchasePrices(r.purchasePrices, ids(r.playerIds)) : null,
  };
}

const SAVED_SQUADS_STORE: VersionedStore<SavedSquad[]> = {
  version: STORAGE_VERSION,
  fallback: [],
  migrate(data, storedVersion) {
    if (!Array.isArray(data)) return null;
    return mapReadableEntries(data, (raw) => normalizeSavedSquad(raw, storedVersion));
  },
};

type SquadsChange = (squads: SavedSquad[]) => SavedSquad[];
const changeListeners = new Set<(change: SquadsChange) => void>();

/** The saved squads as stored, for code outside Team Building (<imported_squad_sync>). */
export function loadSavedSquads(): SavedSquad[] {
  return loadVersioned(STORAGE_KEY, SAVED_SQUADS_STORE);
}

/**
 * Changes the saved squads from outside Team Building (<imported_squad_sync>):
 * through Team Building's own state while it's open, so its edits and this
 * never overwrite each other, else straight in storage, which it reads when
 * it next opens.
 */
export function changeSavedSquads(change: SquadsChange): void {
  if (changeListeners.size > 0) {
    for (const listener of changeListeners) listener(change);
    return;
  }
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, change(loadSavedSquads()));
}

/**
 * <gameweek_log>: on every live load, each squad unchanged since a deadline
 * passed is recorded as it stands for it; nothing changes when there's
 * nothing new, and when it last changed stays as it was.
 */
export function recordSavedSquadDeadlines(now = Date.now()): void {
  changeSavedSquads((squads) => {
    const next = squads.map((s) => recordPassedDeadlines(s, now));
    return next.some((s, i) => s !== squads[i]) ? next : squads;
  });
}

/** Hard cap on saved squads — purely a UI/localStorage-hygiene limit, not an FPL rule. */
export const MAX_SAVED_SQUADS = 5;

export interface UseSavedSquads {
  squads: SavedSquad[];
  upsert: (squad: SavedSquad) => void;
  /** Changes one squad as it is at that moment (a change that arrives later, like prices loaded from FPL, never overwrites edits made meanwhile); nothing if it's gone. */
  update: (id: string, mutator: (squad: SavedSquad) => SavedSquad) => void;
  remove: (id: string) => void;
}

/**
 * Squads persist to the browser's localStorage only — there is no server
 * or account behind this, matching the rest of the app's no-auth,
 * no-server-storage design. Squads are tied to this browser; they won't
 * follow the user to a different device or browser profile.
 *
 * No squad is auto-created: an empty list is a legitimate, expected
 * starting state (first visit, or every squad deleted) — Team Building
 * shows a blank pitch and prompts the user to create or import one via
 * "New Squad" rather than silently seeding a squad nobody asked for.
 */
export function useSavedSquads(): UseSavedSquads {
  const [squads, setSquads] = usePersistentState(STORAGE_KEY, SAVED_SQUADS_STORE);

  useEffect(() => {
    const listener = (change: SquadsChange) => setSquads(change);
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }, [setSquads]);

  // <gameweek_log>: before a change, the squad as it stood is recorded for any deadline passed since it last changed, and its transfers rolled on (<squad_transfers>).
  const upsert = useCallback((squad: SavedSquad) => {
    setSquads((prev) => {
      const idx = prev.findIndex((s) => s.id === squad.id);
      if (idx === -1) return [...prev, { ...squad, updatedAt: Date.now() }];
      const next = [...prev];
      next[idx] = { ...withDeadlinesOf(squad, recordPassedDeadlines(prev[idx]), prev[idx]), updatedAt: Date.now() };
      return next;
    });
  }, []);

  const update = useCallback((id: string, mutator: (squad: SavedSquad) => SavedSquad) => {
    setSquads((prev) => prev.map((s) => (s.id === id ? { ...mutator(recordPassedDeadlines(s)), updatedAt: Date.now() } : s)));
  }, []);

  const remove = useCallback((id: string) => {
    setSquads((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { squads, upsert, update, remove };
}
