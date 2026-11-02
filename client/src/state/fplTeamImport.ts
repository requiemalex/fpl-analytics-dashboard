import { fetchEntryHistory, fetchEntryPicks, fetchEntryTeam } from "../api/client";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import type { RawEntryTeam } from "../types/raw";
import type { NormalizedPlayer } from "../types/normalized";
import type { SavedSquad } from "../types/team";
import { loadImportedPurchasePrices } from "./importedPurchasePrices";
import { changeSavedSquads, loadSavedSquads } from "./useSavedSquads";

/** <purchase_prices> kept only for the players `keep` lets through. */
export function keepPurchases(prices: Record<number, number>, keep: (id: number) => boolean): Record<number, number> {
  return Object.fromEntries(Object.entries(prices).filter(([id]) => keep(Number(id))));
}

/**
 * A real FPL team as a squad: its picks in the latest gameweek FPL shows
 * (the team's `current_event`, else `fallbackEvent`), its chips and bank
 * (normalizeEntryImport), and its purchase prices (<purchase_prices>),
 * which are nice to have, so a failure there doesn't stop the import (they
 * load the next time the squad is opened). `team` saves a request when the
 * caller already has it. Throws if FPL can't be read.
 */
export async function importFplTeam(
  teamId: number,
  fallbackEvent: number,
  playersById: Map<number, NormalizedPlayer>,
  team?: RawEntryTeam,
): Promise<{ squad: SavedSquad; warnings: string[] }> {
  const teamData = team ?? (await fetchEntryTeam(teamId)).data;
  const eventId = teamData.current_event ?? fallbackEvent;
  const [historyResult, picksResult] = await Promise.all([fetchEntryHistory(teamId), fetchEntryPicks(teamId, eventId)]);
  const { squad, warnings } = normalizeEntryImport(teamData, historyResult.data, picksResult.data, eventId, playersById);
  const prices = await loadImportedPurchasePrices(teamId, eventId, playersById).catch(() => null);
  if (prices && squad.importedFrom) {
    squad.importedFrom.purchasePrices = prices.purchasePrices;
    squad.purchasePrices = keepPurchases(prices.purchasePrices, (id) => squad.playerIds.includes(id));
  }
  return { squad, warnings };
}

/** One imported squad brought up to date: which gameweek it now shows and who changed. */
export interface ImportedSquadUpdate {
  squadName: string;
  event: number;
  playersIn: number[];
  playersOut: number[];
}

/** Team ids with a gameweek, `${teamId}:${event}`, already checked this session, so a team FPL hasn't moved on yet isn't asked again every poll. */
const checked = new Set<string>();
let pending: ImportedSquadUpdate[] = [];
const noticeListeners = new Set<() => void>();

/**
 * <imported_squad_sync>: keeps each squad loaded from an FPL team ID in
 * step with that team. Run on every live data load (app start and the
 * background poll): a squad imported before the app's current gameweek is
 * read again from FPL, and if FPL now shows a later gameweek its picks,
 * captaincy, bank, chips and purchase prices replace the squad's (its name
 * stays). A squad already on the current gameweek costs no request: FPL
 * only shows a team's picks once that gameweek's deadline has passed, so
 * a transfer made for the next one can't be read until then. A failed
 * request leaves the squad as it was and is tried again on the next load.
 */
export async function syncImportedSquads(currentEvent: number, playersById: Map<number, NormalizedPlayer>): Promise<ImportedSquadUpdate[]> {
  const behind = loadSavedSquads().filter((s) => s.importedFrom && s.importedFrom.asOfEvent < currentEvent && !checked.has(`${s.importedFrom.teamId}:${currentEvent}`));
  const updates: ImportedSquadUpdate[] = [];
  for (const old of behind) {
    const imported = old.importedFrom!;
    const key = `${imported.teamId}:${currentEvent}`;
    checked.add(key);
    try {
      const team = (await fetchEntryTeam(imported.teamId)).data;
      if ((team.current_event ?? 0) <= imported.asOfEvent) continue;
      const { squad: fresh } = await importFplTeam(imported.teamId, currentEvent, playersById, team);
      // Only the squad as it was checked: one deleted or re-imported meanwhile is left alone.
      const stillBehind = (s: SavedSquad) => s.id === old.id && s.importedFrom?.teamId === imported.teamId && s.importedFrom.asOfEvent === imported.asOfEvent;
      const current = loadSavedSquads().find(stillBehind);
      if (!fresh.importedFrom || !current) continue;
      changeSavedSquads((squads) => squads.map((s) => (stillBehind(s) ? { ...fresh, id: s.id, name: s.name, createdAt: s.createdAt } : s)));
      const before = current.playerIds;
      updates.push({
        squadName: current.name,
        event: fresh.importedFrom.asOfEvent,
        playersIn: fresh.playerIds.filter((id) => !before.includes(id)),
        playersOut: before.filter((id) => !fresh.playerIds.includes(id)),
      });
    } catch {
      checked.delete(key);
    }
  }
  if (updates.length > 0) {
    pending = [...pending, ...updates];
    for (const listener of noticeListeners) listener();
  }
  return updates;
}

/** Updates not yet shown to the user, emptied as they're taken (Team Building shows them). */
export function takeImportedSquadUpdates(): ImportedSquadUpdate[] {
  const taken = pending;
  pending = [];
  return taken;
}

export function subscribeImportedSquadUpdates(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

/** "Eze Peasy now shows FPL's Gameweek 9 team: Saka in, Rice out." A wildcard's worth of changes is counted, not listed. */
export function describeImportedSquadUpdate(update: ImportedSquadUpdate, playersById: ReadonlyMap<number, NormalizedPlayer>): string {
  const head = `${update.squadName} now shows FPL's Gameweek ${update.event} team`;
  const changed = update.playersIn.length;
  if (changed === 0) return `${head}.`;
  if (changed > 3) return `${head}: ${changed} players changed.`;
  const names = (ids: number[]) => ids.map((id) => playersById.get(id)?.name ?? `player ${id}`).join(", ");
  return `${head}: ${names(update.playersIn)} in, ${names(update.playersOut)} out.`;
}

/** For tests: forget what this session has checked and not yet shown. */
export function resetImportedSquadSync(): void {
  checked.clear();
  pending = [];
}
