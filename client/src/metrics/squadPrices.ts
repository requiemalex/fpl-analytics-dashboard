import { SQUAD_RULES, squadBudget, type SavedSquad } from "../types/team";
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
 * started later bought at prices FPL's public data doesn't keep: a
 * starting player whose price hasn't moved since before it joined (his
 * `value` in every match from the last one before it, `priceHistory`,
 * and today) cost today's price (the owner's call, 2026-10-26), and when
 * only one starting player is left, his is what the bank says the 15
 * cost less the others. Anyone else has none (left out, shown "—"), as
 * does anyone whose price can't be found.
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
  /** For a team that started after GW1: each starting player's price (£0.1m) in each of his matches this season, by gameweek. */
  priceHistory?: ReadonlyMap<number, readonly { round: number; value: number }[]>;
}): Record<number, number> {
  const { squadIds, eventId, startedEvent, startIds, startBankTenths, transfers, freeHitEvents, livePlayersById, priceHistory } = args;
  const ignored = new Set(freeHitEvents.filter((e) => e !== eventId));
  const boughtFor = new Map<number, number>();
  for (const t of [...transfers].filter((t) => t.event <= eventId && !ignored.has(t.event)).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))) {
    boughtFor.set(t.element_in, t.element_in_cost);
  }

  const startPrices = startedEvent === 1 ? seasonStartPrices(startIds, startBankTenths, livePlayersById) : lateStartPrices(startedEvent, startIds, startBankTenths, livePlayersById, priceHistory);
  const out: Record<number, number> = {};
  for (const id of squadIds) {
    const price = boughtFor.get(id) ?? startPrices?.get(id);
    if (price !== undefined) out[id] = price / 10;
  }
  return out;
}

/** A GW1 team's starting 15 at season-start prices, only if they add up to £100m − its bank then. */
function seasonStartPrices(
  startIds: readonly number[] | null,
  startBankTenths: number | null,
  livePlayersById: ReadonlyMap<number, Pick<NormalizedPlayer, "price" | "costChangeStart">>,
): Map<number, number> | null {
  if (!startIds || startIds.length !== SQUAD_RULES.squadSize || startBankTenths === null) return null;
  const prices = startIds.map((id) => {
    const p = livePlayersById.get(id);
    return [id, p && p.costChangeStart !== null ? tenths(p.price) - tenths(p.costChangeStart) : null] as const;
  });
  const known = prices.filter((e): e is readonly [number, number] => e[1] !== null);
  const spent = known.reduce((sum, [, price]) => sum + price, 0);
  return known.length === prices.length && tenths(SQUAD_RULES.budget) - spent === startBankTenths ? new Map(known) : null;
}

/** A later starter's 15: today's price where it hasn't moved since before the team joined; the last one by the bank. */
function lateStartPrices(
  startedEvent: number | null,
  startIds: readonly number[] | null,
  startBankTenths: number | null,
  livePlayersById: ReadonlyMap<number, Pick<NormalizedPlayer, "price">>,
  priceHistory: ReadonlyMap<number, readonly { round: number; value: number }[]> | undefined,
): Map<number, number> | null {
  if (startedEvent === null || !startIds || !priceHistory) return null;
  const known = new Map<number, number>();
  const unknown: number[] = [];
  for (const id of startIds) {
    const live = livePlayersById.get(id);
    const rows = [...(priceHistory.get(id) ?? [])].sort((a, b) => a.round - b.round);
    const lastBefore = rows.filter((r) => r.round < startedEvent).at(-1);
    const since = rows.filter((r) => r.round >= startedEvent);
    const today = live ? tenths(live.price) : null;
    if (today !== null && lastBefore && [lastBefore, ...since].every((r) => r.value === today)) known.set(id, today);
    else unknown.push(id);
  }
  if (unknown.length === 1 && startIds.length === SQUAD_RULES.squadSize && startBankTenths !== null) {
    const rest = tenths(SQUAD_RULES.budget) - startBankTenths - [...known.values()].reduce((sum, v) => sum + v, 0);
    if (rest > 0) known.set(unknown[0], rest);
  }
  return known;
}

/**
 * <imported_budget>: what a squad can spend, and what each of its players
 * counts for against it. An import whose purchase prices are loaded
 * (`importedFrom.purchasePrices`) has its bank plus every player it was
 * imported with at his selling price today (<selling_price>): what FPL
 * would let the manager spend. A player still held since the import counts
 * at that selling price, so an unchanged import has exactly its bank left;
 * one added in Scoutline counts at today's price, the price he'd be bought
 * at; one removed leaves his selling price in the money. An imported
 * player with no purchase price counts at today's price on both sides.
 * Otherwise (a squad built from scratch, an import whose prices haven't
 * loaded, or one with a player FPL no longer lists) the stored budget or
 * FPL's £100m, and today's prices.
 */
export function squadMoney(
  squad: Pick<SavedSquad, "importedFrom" | "purchasePrices"> | null | undefined,
  livePrice: (id: number) => number | undefined,
): { budget: number; cost: (p: Pick<NormalizedPlayer, "id" | "price">) => number; atSellingPrices: boolean } {
  const imported = squad?.importedFrom;
  const fallback = { budget: squadBudget(squad), cost: (p: Pick<NormalizedPlayer, "price">) => p.price, atSellingPrices: false };
  if (!squad || !imported || imported.bank === null || !imported.playerIds || !imported.purchasePrices) return fallback;
  const bought = imported.purchasePrices;
  const sellTenths = (id: number, price: number) => tenths(sellingPrice(bought[id], price) ?? price);
  let total = tenths(imported.bank);
  for (const id of imported.playerIds) {
    const price = livePrice(id);
    if (price === undefined) return fallback;
    total += sellTenths(id, price);
  }
  const held = (id: number) => imported.playerIds!.includes(id) && squad.purchasePrices[id] === bought[id];
  return {
    budget: total / 10,
    cost: (p) => (held(p.id) ? sellTenths(p.id, p.price) / 10 : p.price),
    atSellingPrices: true,
  };
}
