import type { RawEntryTeam, RawEntryHistory, RawEntryPicks } from "../types/raw";
import type { NormalizedPlayer, ChipWindow } from "../types/normalized";
import type { SavedSquad, UsedChip } from "../types/team";
import { createBlankSquad } from "../types/team";
import { KNOWN_CHIPS } from "./normalizeChips";

export interface EntryImportResult {
  squad: SavedSquad;
  /** Non-fatal issues worth surfacing — an unmatched player, a chip name this app doesn't recognise, etc. Import still succeeds around them rather than failing outright. */
  warnings: string[];
}

/**
 * Builds a SavedSquad from one gameweek's real picks, the manager's real
 * chip-usage history, and their real team identity — all three already
 * fetched and schema-validated by the caller (see api/client.ts). Never
 * throws on a single bad pick or an unrecognised chip name; those become
 * warnings so the rest of a mostly-good import still lands.
 */
export function normalizeEntryImport(
  team: RawEntryTeam,
  history: RawEntryHistory,
  picks: RawEntryPicks,
  eventId: number,
  livePlayersById: Map<number, NormalizedPlayer>,
): EntryImportResult {
  const warnings: string[] = [];
  const squad = createBlankSquad(team.name?.trim() || `Imported Team ${team.id}`);

  const rawPicks = picks.picks ?? [];
  if (rawPicks.length === 0) {
    warnings.push(`FPL returned no picks for Gameweek ${eventId}. The team may not have been entered yet that week.`);
  }

  for (const pick of rawPicks) {
    const player = livePlayersById.get(pick.element);
    if (!player) {
      warnings.push(`Pick for player id ${pick.element} couldn't be matched to a current player and was skipped (they may have left the league).`);
      continue;
    }
    squad.playerIds.push(player.id);

    // Positions 1-11 are the starting XI. Not multiplier > 0: under Bench
    // Boost the bench scores too (multiplier 1), which put all 15 in the XI
    // (audit 2026-10-18 M10). The multiplier is only a fallback for a pick
    // without a position.
    const inStartingXI = pick.position !== undefined ? pick.position <= 11 : (pick.multiplier ?? 0) > 0;
    if (inStartingXI) squad.startingXI.push(player.id);

    if (pick.is_captain) squad.captainId = player.id;
    if (pick.is_vice_captain) squad.viceCaptainId = player.id;
  }

  if (squad.playerIds.length !== 15) {
    warnings.push(`Imported ${squad.playerIds.length} of 15 players. The rest either didn't match a current player or weren't in this gameweek's picks.`);
  }

  const usedChips: UsedChip[] = [];
  for (const c of history.chips ?? []) {
    const normalizedName = c.name.toLowerCase();
    if (!KNOWN_CHIPS.includes(normalizedName as ChipWindow["chip"])) {
      warnings.push(`FPL reported a chip named "${c.name}" this app doesn't recognise, so it isn't recorded among the squad's chips.`);
      continue;
    }
    usedChips.push({ chip: normalizedName as ChipWindow["chip"], event: c.event });
  }
  squad.usedChips = usedChips;

  const latestGw = (history.current ?? []).slice().sort((a, b) => b.event - a.event)[0];
  // Unknown, not £0.0m, if FPL sends neither (audit 2026-10-18 L4).
  const bankTenths = latestGw?.bank ?? team.last_deadline_bank ?? null;

  squad.importedFrom = {
    teamId: team.id,
    teamName: team.name,
    managerName: `${team.player_first_name} ${team.player_last_name}`.trim(),
    asOfEvent: eventId,
    bank: bankTenths === null ? null : bankTenths / 10,
  };

  return { squad, warnings };
}
