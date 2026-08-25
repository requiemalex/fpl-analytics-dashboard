import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import { goalsMinusXG } from "./calculations";
import { computePositionPercentiles } from "./percentiles";
import { computeBlendedMinutesReliability } from "./minutesReliabilityBlend";
import type { HistoricPlayerProfile } from "./historicAnalysis";

/**
 * Centralised archetype thresholds. These are the "least-assumptive"
 * values chosen where the brief did not pin down an exact number (see
 * README → "Archetype rules" for the full rationale). Change them here —
 * nowhere else in the app hard-codes a price or percentile cutoff.
 */
export const ARCHETYPE_THRESHOLDS = {
  premiumPriceMin: 8.0, // £m
  midPriceMin: 5.1, // £m — covers the £5.1m–£5.4m band that used to fall through both Budget and Mid-priced
  midPriceMax: 7.9, // £m
  budgetPriceMax: 5.0, // £m
  elitePercentile: 90,
  strongPercentile: 70,
  /** Blended minutes reliability (0-1, see minutesReliabilityBlend.ts) required for the Enabler label, alongside price. */
  enablerMinReliability: 0.65,
};

export type ArchetypeLabel =
  | "Premium Player"
  | "Mid-priced Player"
  | "Budget Option"
  | "Enabler"
  | "High-upside Attacker"
  | "High-xGI Defender"
  | "Strong Underlying Attacker"
  | "High-clean sheet Defender"
  | "High def con Defender"
  | "Influential Player"
  | "Rounded Midfielder"
  | "Goals Above xG"
  | "Goals Below xG";

/** Fixed display order for dropdowns/filters — every label the archetype system can produce. */
export const ARCHETYPE_LABELS: ArchetypeLabel[] = [
  "Premium Player",
  "Mid-priced Player",
  "Budget Option",
  "Enabler",
  "High-upside Attacker",
  "High-xGI Defender",
  "Strong Underlying Attacker",
  "High-clean sheet Defender",
  "High def con Defender",
  "Influential Player",
  "Rounded Midfielder",
  "Goals Above xG",
  "Goals Below xG",
];

/**
 * Compact 2-4 character stand-ins for a narrow Archetypes column — a
 * `Record<ArchetypeLabel, string>` rather than a lookup with a fallback,
 * so TypeScript itself refuses to compile if a future archetype is added
 * to ARCHETYPE_LABELS without also getting a short form here.
 */
export const ARCHETYPE_SHORT_LABELS: Record<ArchetypeLabel, string> = {
  "Premium Player": "\u00a3\u00a3\u00a3",
  "Mid-priced Player": "\u00a3\u00a3",
  "Budget Option": "\u00a3",
  Enabler: "En",
  "High-upside Attacker": "HA",
  "High-xGI Defender": "xGD",
  "Strong Underlying Attacker": "SUA",
  "High-clean sheet Defender": "CSD",
  "High def con Defender": "DCD",
  "Influential Player": "Inf",
  "Rounded Midfielder": "RM",
  "Goals Above xG": "G\u2191",
  "Goals Below xG": "G\u2193",
};

interface ArchetypeContext {
  minMinutesThreshold: number;
  xGIPer90Percentiles: Map<number, number | null>;
  goalsPlusAssistsPercentiles: Map<number, number | null>;
  /** Computed on −xGC/90, so a HIGH value here already means a tight defence — no inversion needed where it's used. */
  tightDefencePercentiles: Map<number, number | null>;
  defensiveContributionsPer90Percentiles: Map<number, number | null>;
  ictIndexPercentiles: Map<number, number | null>;
  /** 0-1 blended minutes reliability for this one player — null if there's neither historic nor live data. */
  reliability: number | null;
  /**
   * TODAY's real price — always the live one, regardless of what basis
   * `player` itself was resolved to (live/last-season/historic-average).
   * <archetype_price_basis>: Premium/Mid-priced/Budget/Enabler describe
   * what a player costs to buy right now, so they must always bucket on
   * today's actual price — never a historic-average or last-season price
   * substituted in by resolvePlayerStats for the *performance* fields.
   * Mixing the two produced a real, confusing bug: the same live £8.0m
   * player could show as "Premium" on one page and "Mid-priced" on
   * another (or even on the same page after switching the analysis-mode
   * toggle) purely because one archetype computation happened to run
   * against a historic-priced resolved player object. Fixed by always
   * looking price up here rather than reading `player.price` directly.
   */
  livePrice: number;
}

/**
 * Archetype labels are descriptive, rule-based classifications — never
 * predictions of future performance (<player_archetypes> rule). Not
 * exported — every caller goes through computeArchetypesForAllPlayers
 * below, even for a single player, so there's exactly one place that
 * builds the percentile/reliability context these rules depend on.
 */
function computeArchetypesForPlayer(player: NormalizedPlayer, ctx: ArchetypeContext): ArchetypeLabel[] {
  const labels: ArchetypeLabel[] = [];
  const t = ARCHETYPE_THRESHOLDS;
  const meetsMinutes = player.minutes >= ctx.minMinutesThreshold;
  const price = ctx.livePrice;

  if (price >= t.premiumPriceMin) labels.push("Premium Player");
  else if (price >= t.midPriceMin && price <= t.midPriceMax) labels.push("Mid-priced Player");
  else if (price <= t.budgetPriceMax) labels.push("Budget Option");

  if (price <= t.budgetPriceMax && ctx.reliability !== null && ctx.reliability >= t.enablerMinReliability) {
    labels.push("Enabler");
  }

  const xGIPercentile = ctx.xGIPer90Percentiles.get(player.id) ?? null;
  const gaPercentile = ctx.goalsPlusAssistsPercentiles.get(player.id) ?? null;
  const tightDefencePercentile = ctx.tightDefencePercentiles.get(player.id) ?? null;
  const dcPercentile = ctx.defensiveContributionsPer90Percentiles.get(player.id) ?? null;
  const ictPercentile = ctx.ictIndexPercentiles.get(player.id) ?? null;

  if (meetsMinutes) {
    if (gaPercentile !== null && gaPercentile >= t.elitePercentile && (player.position === "MID" || player.position === "FWD")) {
      labels.push("High-upside Attacker");
    }
    if (xGIPercentile !== null && xGIPercentile >= t.elitePercentile && player.position === "DEF") {
      labels.push("High-xGI Defender");
    }
    if (xGIPercentile !== null && xGIPercentile >= t.strongPercentile) {
      labels.push("Strong Underlying Attacker");
    }
    if (player.position === "DEF" && tightDefencePercentile !== null && tightDefencePercentile >= t.elitePercentile) {
      labels.push("High-clean sheet Defender");
    }
    if (player.position === "DEF" && dcPercentile !== null && dcPercentile >= t.elitePercentile) {
      labels.push("High def con Defender");
    }
    if (ictPercentile !== null && ictPercentile >= t.elitePercentile) {
      labels.push("Influential Player");
    }
    if (player.position === "MID" && dcPercentile !== null && dcPercentile >= t.strongPercentile && xGIPercentile !== null && xGIPercentile >= t.strongPercentile) {
      labels.push("Rounded Midfielder");
    }
  }

  const diff = goalsMinusXG(player.goals, player.xG);
  if (diff !== null) {
    if (diff > 0) labels.push("Goals Above xG");
    if (diff < 0) labels.push("Goals Below xG");
  }

  return labels;
}

/**
 * Computes archetype labels for every player in one pass — the single
 * entry point for the whole archetype system, used for one player just
 * as much as for a whole population (look up `.get(id)` on the result).
 * Builds five percentile maps and one reliability figure per player, all
 * against the full `allPlayers` population per <percentile_population>,
 * so callers never have to assemble this context themselves.
 *
 * `allPlayers` may be a mode-resolved list (see resolvePlayerStats.ts) —
 * that's fine for every percentile-based archetype, which is meant to
 * describe performance under whatever basis is active. `livePlayers`
 * must always be the raw, unresolved pool from AppState, precisely
 * because price-tier archetypes must NOT follow that same basis — see
 * ArchetypeContext.livePrice. Pass the same array for both if there's
 * genuinely no resolved view in play (e.g. always-live contexts).
 */
export function computeArchetypesForAllPlayers(
  allPlayers: NormalizedPlayer[],
  minMinutesThreshold: number,
  teamsById: Map<number, NormalizedTeam>,
  historicProfiles: Map<number, HistoricPlayerProfile>,
  livePlayers: NormalizedPlayer[] = allPlayers,
): Map<number, ArchetypeLabel[]> {
  const xGIPer90Percentiles = computePositionPercentiles(allPlayers, (p) => p.xGIPer90, minMinutesThreshold);
  const goalsPlusAssistsPercentiles = computePositionPercentiles(allPlayers, (p) => p.goals + p.assists, minMinutesThreshold);
  const tightDefencePercentiles = computePositionPercentiles(allPlayers, (p) => (p.xGCPer90 !== null ? -p.xGCPer90 : null), minMinutesThreshold);
  const defensiveContributionsPer90Percentiles = computePositionPercentiles(allPlayers, (p) => p.defensiveContributionsPer90, minMinutesThreshold);
  const ictIndexPercentiles = computePositionPercentiles(allPlayers, (p) => p.ictIndex, minMinutesThreshold);
  const livePriceById = new Map(livePlayers.map((p) => [p.id, p.price]));

  const result = new Map<number, ArchetypeLabel[]>();
  for (const p of allPlayers) {
    const reliability = computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfiles.get(p.id)).value;
    result.set(
      p.id,
      computeArchetypesForPlayer(p, {
        minMinutesThreshold,
        xGIPer90Percentiles,
        goalsPlusAssistsPercentiles,
        tightDefencePercentiles,
        defensiveContributionsPer90Percentiles,
        ictIndexPercentiles,
        reliability,
        livePrice: livePriceById.get(p.id) ?? p.price,
      }),
    );
  }
  return result;
}
