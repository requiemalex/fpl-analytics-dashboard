import type { NormalizedPlayer, Position, PlayerSeasonHistory } from "../types/normalized";
import { MIN_QUALIFYING_SEASON_MINUTES } from "./historicAnalysis";

export type PriceTier = "Budget" | "Mid-priced" | "Premium";

const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];
const PRICE_TIERS: PriceTier[] = ["Budget", "Mid-priced", "Premium"];

/** Same price-tier cutoffs the app has always used for "Premium"/"Mid-priced"/"Budget" — not tied to any other feature, just centralised here since this is the only place left that needs them. */
const PREMIUM_PRICE_MIN = 8.0; // £m
const MID_PRICE_MIN = 5.1; // £m

function priceTierFor(price: number): PriceTier {
  if (price >= PREMIUM_PRICE_MIN) return "Premium";
  if (price >= MID_PRICE_MIN) return "Mid-priced";
  return "Budget";
}

export interface SeasonPositionPoint {
  seasonName: string;
  avgPointsByPosition: Record<Position, number | null>;
  playerCountByPosition: Record<Position, number>;
}

export interface SeasonPriceTierPoint {
  seasonName: string;
  avgPointsByTier: Record<PriceTier, number | null>;
  playerCountByTier: Record<PriceTier, number>;
}

/**
 * <thematic_trends_scope>: this deliberately does NOT rebuild a whole
 * separate qualifying population and percentile computation per season —
 * a materially bigger undertaking than this chart. What it DOES cover is
 * price tier (Premium/Mid-priced/Budget), using that season's OWN price
 * (endCost, falling back to startCost) rather than today's — a player
 * judged by what they cost at the time, consistent with how price tiers
 * work everywhere else in this app. Position is the player's
 * CURRENT position from live data; this app has no record of historical
 * position changes, so a position-switcher's older seasons are grouped
 * under where they play now — a disclosed simplification, not a hidden
 * one (see the chart's own caveat text).
 *
 * A season only counts for a player if they met
 * MIN_QUALIFYING_SEASON_MINUTES that season — the same bar
 * historicProfiles uses elsewhere, so a cameo appearance doesn't drag an
 * average down. Only players still present in the live pool are
 * included, since position/qualification needs current data; a player
 * who's left the Premier League entirely can't be classified and is
 * silently excluded from this specific chart (their own Player Trends
 * chart is unaffected — that one needs no live-pool match).
 */
export function buildThematicTrends(
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>,
  livePlayersById: Map<number, NormalizedPlayer>,
): { byPosition: SeasonPositionPoint[]; byPriceTier: SeasonPriceTierPoint[] } {
  // seasonName -> position -> points[]
  const positionBuckets = new Map<string, Record<Position, number[]>>();
  // seasonName -> tier -> points[]
  const tierBuckets = new Map<string, Record<PriceTier, number[]>>();

  for (const [playerId, seasons] of allTimeSeasonsByPlayerId) {
    const live = livePlayersById.get(playerId);
    if (!live) continue;

    for (const s of seasons) {
      if (s.minutes < MIN_QUALIFYING_SEASON_MINUTES) continue;

      if (!positionBuckets.has(s.seasonName)) {
        positionBuckets.set(s.seasonName, { GKP: [], DEF: [], MID: [], FWD: [] });
      }
      positionBuckets.get(s.seasonName)![live.position].push(s.totalPoints);

      const seasonPrice = s.endCost ?? s.startCost;
      if (seasonPrice !== null) {
        if (!tierBuckets.has(s.seasonName)) {
          tierBuckets.set(s.seasonName, { Budget: [], "Mid-priced": [], Premium: [] });
        }
        tierBuckets.get(s.seasonName)![priceTierFor(seasonPrice)].push(s.totalPoints);
      }
    }
  }

  const avg = (values: number[]): number | null => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const byPosition: SeasonPositionPoint[] = [...positionBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seasonName, byPos]) => ({
      seasonName,
      avgPointsByPosition: Object.fromEntries(POSITIONS.map((p) => [p, avg(byPos[p])])) as Record<Position, number | null>,
      playerCountByPosition: Object.fromEntries(POSITIONS.map((p) => [p, byPos[p].length])) as Record<Position, number>,
    }));

  const byPriceTier: SeasonPriceTierPoint[] = [...tierBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seasonName, byTier]) => ({
      seasonName,
      avgPointsByTier: Object.fromEntries(PRICE_TIERS.map((t) => [t, avg(byTier[t])])) as Record<PriceTier, number | null>,
      playerCountByTier: Object.fromEntries(PRICE_TIERS.map((t) => [t, byTier[t].length])) as Record<PriceTier, number>,
    }));

  return { byPosition, byPriceTier };
}
