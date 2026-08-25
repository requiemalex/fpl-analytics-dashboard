import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import type { ArchetypeLabel } from "../metrics/archetypes";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { computeBlendedMinutesReliability } from "./minutesReliabilityBlend";
import { computeExpectedPointsForWindow, type ExpectedPointsWindow } from "./expectedPoints";
import type { UpcomingFixture } from "./fixtureTicker";
import { SQUAD_RULES } from "../types/team";

export interface ExpectedPointsResult {
  total: number | null;
  playersWithNoData: number;
}

/**
 * Sum of each starting-XI player's expected points for the selected
 * window (captain doubled, matching real FPL scoring) — the window
 * figures themselves come from metrics/expectedPoints.ts (FPL's own
 * `ep_next` for the immediate fixture, fixture-difficulty-extended for
 * the rest). A player with no figure for the window contributes 0 and
 * is counted in playersWithNoData rather than nulling the whole total,
 * so one unknown doesn't blank an otherwise-readable squad total.
 */
export function expectedGameweekPoints(
  startingXI: NormalizedPlayer[],
  captainId: number | null,
  expectedPointsByPlayerId: Map<number, number | null>,
): ExpectedPointsResult {
  if (startingXI.length === 0) return { total: null, playersWithNoData: 0 };
  let total = 0;
  let playersWithNoData = 0;
  for (const p of startingXI) {
    const ep = expectedPointsByPlayerId.get(p.id) ?? null;
    if (ep === null) {
      playersWithNoData += 1;
      continue;
    }
    const multiplier = p.id === captainId ? 2 : 1;
    total += ep * multiplier;
  }
  return { total, playersWithNoData };
}

export type ExpectedPointsChip = "none" | "bboost" | "3xc";

/**
 * Same idea as expectedGameweekPoints, but lets you preview the effect of
 * playing Bench Boost or Triple Captain — deliberately excludes Free Hit
 * and Wildcard, which don't have a well-defined effect on a FIXED squad's
 * projected points (their whole point is bringing in players you don't
 * currently have, which this function has no way to guess at).
 *
 * <chip_effect_one_gameweek_only>: a chip is played for exactly one
 * gameweek, never held across a multi-gameweek window — so for a 3- or
 * 5-GW window, the chip's effect is only applied to the FIRST upcoming
 * fixture's contribution, not scaled across the whole window. Bench
 * Boost: the bench's point total is added, but only for that first
 * fixture (the other window fixtures assume a normal XI-only week).
 * Triple Captain: the captain's multiplier becomes 3x instead of 2x, but
 * only for their first fixture's contribution — later fixtures in the
 * window revert to the normal 2x captain multiplier.
 */
export function computeChipAdjustedExpectedPoints(
  startingXI: NormalizedPlayer[],
  benchPlayers: NormalizedPlayer[],
  captainId: number | null,
  fixturesByTeamId: Map<number, UpcomingFixture[]>,
  window: ExpectedPointsWindow,
  chip: ExpectedPointsChip,
): ExpectedPointsResult {
  if (startingXI.length === 0) return { total: null, playersWithNoData: 0 };

  function windowAndFirstFixture(player: NormalizedPlayer): { windowEP: number | null; firstFixtureEP: number | null } {
    const fixtures = fixturesByTeamId.get(player.teamId) ?? [];
    return {
      windowEP: computeExpectedPointsForWindow(player, fixtures, window),
      firstFixtureEP: computeExpectedPointsForWindow(player, fixtures, 1),
    };
  }

  let total = 0;
  let playersWithNoData = 0;

  for (const p of startingXI) {
    const { windowEP, firstFixtureEP } = windowAndFirstFixture(p);
    if (windowEP === null || firstFixtureEP === null) {
      playersWithNoData += 1;
      continue;
    }
    const isCaptain = p.id === captainId;
    if (chip === "3xc" && isCaptain) {
      const restOfWindowEP = windowEP - firstFixtureEP;
      total += firstFixtureEP * 3 + restOfWindowEP * 2;
    } else {
      total += windowEP * (isCaptain ? 2 : 1);
    }
  }

  if (chip === "bboost") {
    for (const p of benchPlayers) {
      const { firstFixtureEP } = windowAndFirstFixture(p);
      if (firstFixtureEP === null) {
        playersWithNoData += 1;
        continue;
      }
      total += firstFixtureEP;
    }
  }

  return { total, playersWithNoData };
}

export interface MinutesReliabilityResult {
  average: number | null; // 0-1
  perPlayer: Map<number, number | null>; // 0-1, null if there's neither live nor historic data
}

/**
 * Squad-average of the blended (historic + live, availability-adjusted)
 * per-player reliability from minutesReliabilityBlend.ts — see that file
 * for the adaptive weighting. Delegated to per-player here rather than
 * reimplemented, so the aggregate card and each player's tile can never
 * disagree about what "reliability" means.
 */
export function minutesReliability(
  squadPlayers: NormalizedPlayer[],
  teamsById: Map<number, NormalizedTeam>,
  historicProfiles: Map<number, HistoricPlayerProfile>,
): MinutesReliabilityResult {
  const perPlayer = new Map<number, number | null>();
  const values: number[] = [];

  for (const p of squadPlayers) {
    const team = teamsById.get(p.teamId);
    const { value } = computeBlendedMinutesReliability(p, team, historicProfiles.get(p.id));
    perPlayer.set(p.id, value);
    if (value !== null) values.push(value);
  }

  const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  return { average, perPlayer };
}

const STRONG_ARCHETYPES: ArchetypeLabel[] = [
  "High-upside Attacker",
  "High-xGI Defender",
  "Strong Underlying Attacker",
  "High-clean sheet Defender",
  "High def con Defender",
  "Influential Player",
  "Rounded Midfielder",
];

/**
 * Squad players who are both low-owned and, per the app's existing
 * archetype rules, statistically strong — reusing the same analysis
 * already surfaced elsewhere in the dashboard rather than a new formula.
 */
export function findDifferentials(
  squadPlayers: NormalizedPlayer[],
  archetypeMap: Map<number, ArchetypeLabel[]>,
  ownershipMax: number = SQUAD_RULES.differentialOwnershipMax,
): NormalizedPlayer[] {
  return squadPlayers.filter((p) => {
    if (p.ownership === null || p.ownership >= ownershipMax) return false;
    const labels = archetypeMap.get(p.id) ?? [];
    return labels.some((l) => STRONG_ARCHETYPES.includes(l));
  });
}

export interface ArchetypeMixEntry {
  label: ArchetypeLabel;
  count: number;
}

/** Tally of archetype labels across the squad, most-common first. */
export function archetypeMix(squadPlayers: NormalizedPlayer[], archetypeMap: Map<number, ArchetypeLabel[]>): ArchetypeMixEntry[] {
  const counts = new Map<ArchetypeLabel, number>();
  for (const p of squadPlayers) {
    for (const label of archetypeMap.get(p.id) ?? []) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
