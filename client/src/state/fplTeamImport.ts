import { fetchEntryHistory, fetchEntryPicks, fetchEntryTeam } from "../api/client";
import { freeTransfersFromHistory } from "../metrics/squadTransfers";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import type { RawEntryHistory, RawEntryTeam } from "../types/raw";
import type { NormalizedPlayer } from "../types/normalized";
import { snapshotOf, type SavedSquad, type TransferWindow } from "../types/team";
import { loadImportedPurchasePrices } from "./importedPurchasePrices";
import { changeSavedSquads, loadSavedSquads } from "./useSavedSquads";

/**
 * An FPL team ID the server will look up: the same rule as its isValidTeamId (server/src/teamId.ts)
 * (whole digits, under 12 of them), and above 0. Anything else gets "Enter a
 * valid FPL team ID" in the New Squad dialog, not a failed request.
 */
export function isValidFplTeamId(raw: string): boolean {
  return /^\d+$/.test(raw) && raw.length < 12 && Number(raw) > 0;
}

/** <purchase_prices> kept only for the players `keep` lets through. */
export function keepPurchases(prices: Record<number, number>, keep: (id: number) => boolean): Record<number, number> {
  return Object.fromEntries(Object.entries(prices).filter(([id]) => keep(Number(id))));
}

/**
 * <squad_transfers>: an import's transfers for the gameweek after the one
 * FPL last shows (`event`): its free transfers from FPL's history of it
 * (freeTransfersFromHistory), counted from the players it was imported
 * with. A team yet to play its first gameweek has unlimited ones.
 */
export function importTransferWindow(history: RawEntryHistory, squad: SavedSquad, event: number): TransferWindow {
  const base = squad.importedFrom?.playerIds ?? squad.playerIds;
  return { event, free: freeTransfersFromHistory(history), made: 0, baseIds: [...base], start: snapshotOf(squad), chip: null };
}

/**
 * <squad_transfers> for an import saved before they were kept: read from
 * FPL's history of the team, for the gameweek after the latest it shows
 * (`upcomingEvent` for a team yet to play one). Throws if FPL can't be read.
 */
export async function loadImportTransfers(teamId: number, squad: SavedSquad, upcomingEvent: number): Promise<TransferWindow> {
  const history = (await fetchEntryHistory(teamId)).data;
  const latest = Math.max(0, ...(history.current ?? []).map((gw) => gw.event));
  return importTransferWindow(history, squad, latest > 0 ? latest + 1 : upcomingEvent);
}

/** The gameweek whose picks are the team's own after `eventId`: the one before, when `eventId` was a Free Hit (its squad lasts that gameweek); else `eventId`. */
export function ownPicksEvent(history: RawEntryHistory, eventId: number, startedEvent: number | undefined): number {
  const freeHit = (history.chips ?? []).some((c) => c.event === eventId && c.name.toLowerCase() === "freehit");
  return freeHit && eventId > (startedEvent ?? 1) ? eventId - 1 : eventId;
}

/**
 * A real FPL team as a squad: its picks in the latest gameweek FPL shows
 * (the team's `current_event`, else `fallbackEvent`) — or, when that was a
 * Free Hit, the gameweek's before, the squad it goes back to — its chips
 * and bank (normalizeEntryImport), its transfers for the next gameweek
 * (<squad_transfers>), and its purchase prices (<purchase_prices>), which
 * are nice to have, so a failure there doesn't stop the import (they load
 * the next time the squad is opened). `team` saves a request when the
 * caller already has it; `upcomingEvent` is the gameweek open for picks,
 * for a team yet to play (one that has is always on the gameweek after
 * its latest). Throws if FPL can't be read.
 */
export async function importFplTeam(
  teamId: number,
  fallbackEvent: number,
  playersById: Map<number, NormalizedPlayer>,
  options: { team?: RawEntryTeam; upcomingEvent?: number | null } = {},
): Promise<{ squad: SavedSquad; warnings: string[] }> {
  const teamData = options.team ?? (await fetchEntryTeam(teamId)).data;
  const eventId = teamData.current_event ?? fallbackEvent;
  const [historyResult, latestPicks] = await Promise.all([fetchEntryHistory(teamId), fetchEntryPicks(teamId, eventId)]);
  const history = historyResult.data;
  const picksEvent = ownPicksEvent(history, eventId, teamData.started_event);
  const picks = picksEvent === eventId ? latestPicks.data : (await fetchEntryPicks(teamId, picksEvent)).data;
  const { squad, warnings } = normalizeEntryImport(teamData, history, picks, eventId, playersById, picksEvent);
  const prices = await loadImportedPurchasePrices(teamId, picksEvent, playersById).catch(() => null);
  if (prices && squad.importedFrom) {
    squad.importedFrom.purchasePrices = prices.purchasePrices;
    squad.purchasePrices = keepPurchases(prices.purchasePrices, (id) => squad.playerIds.includes(id));
  }
  // After the prices: the window's `start` is what Reset Draft puts back, prices included (<reset_draft>).
  const transfersEvent = teamData.current_event !== null ? teamData.current_event + 1 : (options.upcomingEvent ?? null);
  if (transfersEvent !== null) squad.transfers = importTransferWindow(history, squad, transfersEvent);
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

/**
 * <imported_squad_sync>: keeps each squad loaded from an FPL team ID in
 * step with that team. Run on every live data load (app start and the
 * background poll): a squad imported before the app's current gameweek is
 * read again from FPL, and if FPL now shows a later gameweek its picks,
 * captaincy, bank, chips, transfers and purchase prices replace the squad's (its name
 * stays), quietly: the manager made those changes, so nothing announces
 * them. A squad already on the current gameweek costs no request: FPL
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
      const { squad: fresh } = await importFplTeam(imported.teamId, currentEvent, playersById, { team, upcomingEvent: currentEvent + 1 });
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
  return updates;
}

/** For tests: forget what this session has checked. */
export function resetImportedSquadSync(): void {
  checked.clear();
}
