import { SQUAD_RULES } from "../types/team";
import type { NormalizedPlayer } from "../types/normalized";
import type { RawEntryTransfer } from "../types/raw";

/** £m to FPL's £0.1m units, without float dust. */
const tenths = (m: number) => Math.round(m * 10);

/**
 * <selling_price>: what FPL pays for a player sold: his purchase price
 * plus half of any rise since, rounded down to £0.1m; after a fall, today's
 * price (the whole loss is the manager's). Null without a purchase price.
 */
export function sellingPrice(purchase: number | null | undefined, now: number): number | null {
  if (purchase === null || purchase === undefined) return null;
  const bought = tenths(purchase);
  const today = tenths(now);
  return (today > bought ? bought + Math.floor((today - bought) / 2) : today) / 10;
}

/**
 * <purchase_prices>, for an imported team: what it paid for each player in
 * its squad as of gameweek `eventId`, in £m, from FPL's public data, with
 * no login. A player it bought by transfer cost that transfer's
 * `element_in_cost` (his last one, if bought more than once). Transfers
 * made in a Free Hit week don't count, because the squad goes back
 * afterwards (unless `eventId` is that week, when the import is its
 * temporary squad). A player it has had since it started cost his price
 * then: for a team that started in GW1 that's his season-start price
 * (`now_cost − cost_change_start`), trusted only when the starting squad's
 * prices add up exactly to FPL's own bank for that week (£100m − bank).
 * Checked 2026-10-26 by replaying 12 real teams' transfers onto those
 * prices: every one ended on FPL's own bank to the £0.1m. A team that
 * started later bought at prices FPL's public data doesn't keep, so those
 * players have none (left out, shown "—"), as does anyone whose price
 * can't be found.
 */
export function importedPurchasePrices(args: {
  squadIds: readonly number[];
  eventId: number;
  startedEvent: number | null;
  /** The squad's picks in the gameweek it started, and its bank then (£0.1m); null when unknown. */
  startIds: readonly number[] | null;
  startBankTenths: number | null;
  transfers: readonly RawEntryTransfer[];
  freeHitEvents: readonly number[];
  livePlayersById: ReadonlyMap<number, Pick<NormalizedPlayer, "price" | "costChangeStart">>;
}): Record<number, number> {
  const { squadIds, eventId, startedEvent, startIds, startBankTenths, transfers, freeHitEvents, livePlayersById } = args;
  const ignored = new Set(freeHitEvents.filter((e) => e !== eventId));
  const boughtFor = new Map<number, number>();
  for (const t of [...transfers].filter((t) => t.event <= eventId && !ignored.has(t.event)).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))) {
    boughtFor.set(t.element_in, t.element_in_cost);
  }

  const startPrice = (id: number): number | null => {
    const p = livePlayersById.get(id);
    return p && p.costChangeStart !== null ? tenths(p.price) - tenths(p.costChangeStart) : null;
  };
  let startPrices: Map<number, number> | null = null;
  if (startedEvent === 1 && startIds && startIds.length === SQUAD_RULES.squadSize && startBankTenths !== null) {
    const prices = startIds.map((id) => [id, startPrice(id)] as const);
    const known = prices.filter((e): e is readonly [number, number] => e[1] !== null);
    const spent = known.reduce((sum, [, price]) => sum + price, 0);
    if (known.length === prices.length && tenths(SQUAD_RULES.budget) - spent === startBankTenths) startPrices = new Map(known);
  }

  const out: Record<number, number> = {};
  for (const id of squadIds) {
    const price = boughtFor.get(id) ?? startPrices?.get(id);
    if (price !== undefined) out[id] = price / 10;
  }
  return out;
}
