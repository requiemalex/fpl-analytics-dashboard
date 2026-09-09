import type { RawBootstrapStatic, RawElement, RawElementType, RawTeam } from "../types/raw";
import type { NormalizedPlayer, Position, PriceChangeInfo } from "../types/normalized";
import { parseNumericString, parseNumberOrNull } from "./parseNumeric";
import { detectAdvancedFieldAvailability, type AdvancedFieldAvailability } from "./fieldAvailability";

function normalizePriceChange(el: RawElement, availability: AdvancedFieldAvailability): PriceChangeInfo | null {
  if (!availability.price_change_percent) return null;
  const percent = parseNumericString(el.price_change_percent ?? null);
  if (percent === null) return null;
  const projections = availability.price_change_projections
    ? (el.price_change_projections ?? [])
        .map((p) => {
          const projectedPercent = parseNumericString(p.projected_percent);
          return projectedPercent === null ? null : { offsetDays: p.offset, projectedPercent, likelihood: p.likelihood };
        })
        .filter((p): p is { offsetDays: number; projectedPercent: number; likelihood: number } => p !== null)
    : [];
  return {
    percent,
    projections,
    lockedUntil: el.price_change_locked_until ?? null,
    calibrating: availability.price_change_calibrating ? (el.price_change_calibrating ?? false) : false,
  };
}

const KNOWN_POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

function buildPositionMap(elementTypes: RawElementType[]): Map<number, Position> {
  const map = new Map<number, Position>();
  for (const et of elementTypes) {
    const short = et.singular_name_short as Position;
    if (KNOWN_POSITIONS.includes(short)) {
      map.set(et.id, short);
    }
  }
  return map;
}

function buildTeamMap(teams: RawTeam[]): Map<number, RawTeam> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * £0.1m units → £millions. See <price> rules: now_cost 100 must never be
 * treated as £100m.
 */
function priceInMillions(nowCost: number): number {
  return nowCost / 10;
}

function normalizeOnePlayer(
  el: RawElement,
  positionMap: Map<number, Position>,
  teamMap: Map<number, RawTeam>,
  availability: AdvancedFieldAvailability,
): NormalizedPlayer | null {
  const position = positionMap.get(el.element_type);
  const team = teamMap.get(el.team);
  if (!position || !team) {
    // Structurally broken record (unknown team/position id) — exclude
    // rather than guess, and let the caller surface a warning.
    return null;
  }

  return {
    id: el.id,
    name: el.web_name,
    firstName: el.first_name,
    lastName: el.second_name,
    teamId: team.id,
    teamName: team.name,
    teamShortName: team.short_name,
    position,

    price: priceInMillions(el.now_cost),
    ownership: parseNumericString(el.selected_by_percent),

    totalPoints: el.total_points,
    pointsPerGame: parseNumericString(el.points_per_game),
    epNext: parseNumericString(el.ep_next),
    minutes: el.minutes,
    starts: availability.starts ? parseNumberOrNull(el.starts) : null,
    goals: el.goals_scored,
    assists: el.assists,
    cleanSheets: el.clean_sheets,
    bonus: el.bonus,
    bps: el.bps,
    ictIndex: parseNumericString(el.ict_index),
    saves: parseNumberOrNull(el.saves),
    savesPer90: parseNumberOrNull(el.saves_per_90),

    xG: availability.expected_goals ? parseNumericString(el.expected_goals) : null,
    xA: availability.expected_assists ? parseNumericString(el.expected_assists) : null,
    xGI: availability.expected_goal_involvements ? parseNumericString(el.expected_goal_involvements) : null,
    xGC: availability.expected_goals_conceded ? parseNumericString(el.expected_goals_conceded) : null,

    xGPer90: availability.expected_goals_per_90 ? parseNumberOrNull(el.expected_goals_per_90) : null,
    xAPer90: availability.expected_assists_per_90 ? parseNumberOrNull(el.expected_assists_per_90) : null,
    xGIPer90: availability.expected_goal_involvements_per_90 ? parseNumberOrNull(el.expected_goal_involvements_per_90) : null,
    xGCPer90: availability.expected_goals_conceded_per_90 ? parseNumberOrNull(el.expected_goals_conceded_per_90) : null,

    defensiveContributions: availability.defensive_contribution ? parseNumberOrNull(el.defensive_contribution) : null,
    defensiveContributionsPer90: availability.defensive_contribution_per_90 ? parseNumberOrNull(el.defensive_contribution_per_90) : null,

    status: el.status,
    news: el.news,
    chanceOfPlayingNextRound: el.chance_of_playing_next_round,

    form: availability.form ? parseNumericString(el.form ?? null) : null,

    transfersInEvent: availability.transfers_in_event ? parseNumberOrNull(el.transfers_in_event) : null,
    transfersOutEvent: availability.transfers_out_event ? parseNumberOrNull(el.transfers_out_event) : null,
    transfersInTotal: availability.transfers_in ? parseNumberOrNull(el.transfers_in) : null,
    transfersOutTotal: availability.transfers_out ? parseNumberOrNull(el.transfers_out) : null,
    costChangeEvent: availability.cost_change_event && el.cost_change_event != null ? el.cost_change_event / 10 : null,
    costChangeStart: availability.cost_change_start && el.cost_change_start != null ? el.cost_change_start / 10 : null,

    priceChange: normalizePriceChange(el, availability),
  };
}

export interface NormalizationResult {
  players: NormalizedPlayer[];
  skippedCount: number;
  advancedFieldAvailability: AdvancedFieldAvailability;
  /** Total registered FPL managers, from bootstrap-static's top-level total_players — null if that field is ever absent. Used to turn ownership% into an approximate owner count (see metrics/priceChange.ts). */
  totalPlayers: number | null;
}

export function normalizePlayers(bootstrap: RawBootstrapStatic): NormalizationResult {
  const positionMap = buildPositionMap(bootstrap.element_types);
  const teamMap = buildTeamMap(bootstrap.teams);
  const availability = detectAdvancedFieldAvailability(bootstrap.elements);

  const players: NormalizedPlayer[] = [];
  let skippedCount = 0;

  for (const el of bootstrap.elements) {
    const normalized = normalizeOnePlayer(el, positionMap, teamMap, availability);
    if (normalized) {
      players.push(normalized);
    } else {
      skippedCount += 1;
    }
  }

  return { players, skippedCount, advancedFieldAvailability: availability, totalPlayers: bootstrap.total_players ?? null };
}
