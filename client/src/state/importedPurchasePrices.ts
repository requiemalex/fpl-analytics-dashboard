import { fetchElementSummary, fetchEntryHistory, fetchEntryPicks, fetchEntryTeam, fetchEntryTransfers } from "../api/client";
import { importedPurchasePrices } from "../metrics/squadPrices";
import type { NormalizedPlayer } from "../types/normalized";

/**
 * <purchase_prices>, from FPL: the players an imported team had in
 * gameweek `eventId` (those FPL still lists, as the import keeps them) and
 * what it paid for each (importedPurchasePrices, metrics/squadPrices.ts).
 * Reads FPL's public team endpoints (no login) — its transfers, its picks
 * in the gameweek it started — and, for a team that started after GW1,
 * its starting players' price history (element-summary, one each). A failed
 * request throws: the caller keeps the squad without prices and tries again
 * another time.
 */
export async function loadImportedPurchasePrices(
  teamId: number,
  eventId: number,
  livePlayersById: ReadonlyMap<number, NormalizedPlayer>,
): Promise<{ playerIds: number[]; purchasePrices: Record<number, number> }> {
  const [team, history, picks, transfers] = await Promise.all([fetchEntryTeam(teamId), fetchEntryHistory(teamId), fetchEntryPicks(teamId, eventId), fetchEntryTransfers(teamId)]);
  const startedEvent = team.data.started_event ?? null;
  const startPicks = startedEvent === null ? null : startedEvent === eventId ? picks.data : (await fetchEntryPicks(teamId, startedEvent)).data;
  const startIds = startPicks?.picks?.map((p) => p.element) ?? null;

  let priceHistory: Map<number, { round: number; value: number }[]> | undefined;
  if (startedEvent !== null && startedEvent > 1 && startIds) {
    const rows = await Promise.all(
      startIds.map((id) =>
        fetchElementSummary(id)
          .then((r) => [id, r.data.history.flatMap((h) => (h.value === undefined ? [] : [{ round: h.round, value: h.value }]))] as const)
          // One player's history missing leaves only his price unknown.
          .catch(() => [id, []] as const),
      ),
    );
    priceHistory = new Map(rows.map(([id, list]) => [id, [...list]]));
  }

  const playerIds = (picks.data.picks ?? []).map((p) => p.element).filter((id) => livePlayersById.has(id));
  const purchasePrices = importedPurchasePrices({
    squadIds: playerIds,
    eventId,
    startedEvent,
    startIds,
    startBankTenths: (history.data.current ?? []).find((gw) => gw.event === startedEvent)?.bank ?? null,
    transfers: transfers.data,
    freeHitEvents: (history.data.chips ?? []).filter((c) => c.name.toLowerCase() === "freehit").map((c) => c.event),
    livePlayersById,
    priceHistory,
  });
  return { playerIds, purchasePrices };
}
