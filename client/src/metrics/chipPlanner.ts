import type { NormalizedPlayer, NormalizedFixture, NormalizedTeam, NormalizedEvent, ChipWindow } from "../types/normalized";
import type { UsedChip } from "../types/team";
import { fixtureMultiplier } from "./expectedPoints";

/**
 * Whether a squad's recorded chip usage covers this specific window — an
 * event-level record (from an FPL import) counts if it falls inside the
 * window's own gameweek range; a manually-ticked record (event: null, no
 * specific gameweek known) counts regardless, since there's no gameweek
 * to check it against. Shared between Team Building's own "Chips Used"
 * card and Chip Planner's recommendation filtering so the two can never
 * quietly disagree about what's already been played.
 */
export function isChipUsedForWindow(usedChips: UsedChip[], window: ChipWindow): boolean {
  return usedChips.some((c) => c.chip === window.chip && (c.event === null || (c.event >= window.startEvent && c.event <= window.stopEvent)));
}

export interface GwFixtureInfo {
  fixtureId: number;
  opponentShortName: string;
  isHome: boolean;
  difficulty: number;
}

export interface PlayerGameweekEntry {
  playerId: number;
  fixtures: GwFixtureInfo[];
  /**
   * epNext (or pointsPerGame if epNext is unavailable) scaled by each
   * fixture's own difficulty, summed across however many fixtures the
   * player has that gameweek (0 for a blank, 2+ summed for a double).
   * Uses TODAY's baseline rate projected across every remaining gameweek —
   * unlike Team Building's "next fixture" figure, this doesn't get to
   * treat the nearest gameweek specially, because the whole point here is
   * one consistent method across a gameweek that might be 1 week or 30
   * weeks away. It does NOT account for price rises, injuries, transfers,
   * or changing form between now and that gameweek. Treat it as a
   * fixture-difficulty-based planning aid, not a forecast — see the
   * Chip Planner page's own banner.
   */
  projectedPoints: number | null;
}

export interface SquadClash {
  fixtureId: number;
  teamAId: number;
  teamBId: number;
  teamAPlayers: NormalizedPlayer[];
  teamBPlayers: NormalizedPlayer[];
}

export interface SquadGameweekProfile {
  gw: number;
  deadline: string | null;
  /** Sum of fixture-instances across the full 15-man squad (a double counts twice). */
  totalFixtures: number;
  blankPlayerIds: number[];
  doublePlayerIds: number[];
  /** Simple average difficulty across every fixture-instance the squad has this gameweek — null if the squad has no fixtures at all. */
  avgDifficulty: number | null;
  /**
   * Sum of every squad player's projectedPoints, treating an unprojectable
   * player as 0 (see unprojectedCount for how many that affected), MINUS
   * clashPenalty (see below). This is the figure Bench Boost ranks on.
   */
  totalProjectedPoints: number | null;
  unprojectedCount: number;
  /** Fixtures this gameweek where two of the squad's OWN players are on opposite sides — see buildSquadClashes. */
  clashes: SquadClash[];
  /**
   * A deliberately modest, transparent haircut subtracted from the raw sum
   * of individual projections when squad players face each other. <clash_
   * penalty_rationale>: individual projections are computed independently
   * per player, which silently assumes every squad player can hit their
   * own ceiling regardless of what anyone else in the squad is doing. That
   * assumption breaks down specifically when two squad players are in the
   * same match on opposite sides — a striker scoring past your own
   * goalkeeper/defender is the literal mechanism by which the defensive
   * side's clean-sheet points (and often their bonus) go away, so summing
   * both sides' projections at face value overstates the realistic
   * combined return from that one fixture. For each clash, the penalty is
   * 20% of the WEAKER side's own projected total for that fixture (the
   * smaller of the two sides' summed projections) — a conservative,
   * clearly-bounded adjustment, not a claim about exactly how much either
   * side's output will actually fall. It only affects the squad-wide sum
   * used for Bench Boost; it does not alter any individual player's own
   * projectedPoints, and it does not change Triple Captain's own ranking
   * (see recommendTripleCaptain's own reasoning for why that's a
   * deliberate choice, not an oversight).
   */
  clashPenalty: number;
  players: Map<number, PlayerGameweekEntry>;
}

/** teamId -> gw -> that team's fixtures in that gw (0, 1, or 2+). Only fixtures already assigned to a gameweek are included; unscheduled fixtures are silently dropped rather than guessed into a gw. */
function buildTeamGwFixtures(fixtures: NormalizedFixture[], teamsById: Map<number, NormalizedTeam>): Map<number, Map<number, GwFixtureInfo[]>> {
  const map = new Map<number, Map<number, GwFixtureInfo[]>>();
  const add = (teamId: number, gw: number, entry: GwFixtureInfo) => {
    if (!map.has(teamId)) map.set(teamId, new Map());
    const byGw = map.get(teamId)!;
    if (!byGw.has(gw)) byGw.set(gw, []);
    byGw.get(gw)!.push(entry);
  };
  for (const f of fixtures) {
    if (f.eventId === null || f.finished) continue;
    const homeOpp = teamsById.get(f.awayTeamId)?.shortName ?? "???";
    const awayOpp = teamsById.get(f.homeTeamId)?.shortName ?? "???";
    add(f.homeTeamId, f.eventId, { fixtureId: f.id, opponentShortName: homeOpp, isHome: true, difficulty: f.homeDifficulty });
    add(f.awayTeamId, f.eventId, { fixtureId: f.id, opponentShortName: awayOpp, isHome: false, difficulty: f.awayDifficulty });
  }
  return map;
}

/**
 * Finds every fixture this gameweek where two DIFFERENT teams both have at
 * least one squad player — i.e. the squad has players on opposite sides of
 * the same match. Grouping by fixtureId (shared by both sides of a match)
 * rather than by team pairing, so this works the same whether it's a
 * single game or, in a double gameweek, one of several.
 */
function buildSquadClashes(squadPlayers: NormalizedPlayer[], teamGwEntries: Map<number, GwFixtureInfo[]>): SquadClash[] {
  const byFixture = new Map<number, { teamId: number; player: NormalizedPlayer }[]>();
  for (const player of squadPlayers) {
    const entries = teamGwEntries.get(player.id) ?? [];
    for (const info of entries) {
      const list = byFixture.get(info.fixtureId) ?? [];
      list.push({ teamId: player.teamId, player });
      byFixture.set(info.fixtureId, list);
    }
  }
  const clashes: SquadClash[] = [];
  for (const [fixtureId, entries] of byFixture) {
    const teamIds = [...new Set(entries.map((e) => e.teamId))];
    if (teamIds.length < 2) continue; // same-team squadmates aren't a clash
    const [teamAId, teamBId] = teamIds;
    clashes.push({
      fixtureId,
      teamAId,
      teamBId,
      teamAPlayers: entries.filter((e) => e.teamId === teamAId).map((e) => e.player),
      teamBPlayers: entries.filter((e) => e.teamId === teamBId).map((e) => e.player),
    });
  }
  return clashes;
}

function projectedPointsFor(player: NormalizedPlayer, fixtures: GwFixtureInfo[]): number | null {
  const baseline = player.epNext ?? player.pointsPerGame;
  if (baseline === null || fixtures.length === 0) return fixtures.length === 0 ? 0 : null;
  return fixtures.reduce((sum, f) => sum + baseline * fixtureMultiplier(f.difficulty, player.position), 0);
}

/**
 * One profile per remaining gameweek (fromGw..toGw inclusive) for the
 * given squad. `players` is every id in `squadPlayerIds`, whether or not
 * they're in the starting XI — Bench Boost specifically needs the whole
 * 15, and blanks/doubles matter for the full squad regardless.
 */
export function buildSquadGameweekProfiles(
  squadPlayers: NormalizedPlayer[],
  fixtures: NormalizedFixture[],
  teamsById: Map<number, NormalizedTeam>,
  events: NormalizedEvent[],
  fromGw: number,
  toGw: number,
): SquadGameweekProfile[] {
  const teamGw = buildTeamGwFixtures(fixtures, teamsById);
  const deadlineByGw = new Map(events.map((e) => [e.id, e.deadlineTime]));
  const profiles: SquadGameweekProfile[] = [];

  for (let gw = fromGw; gw <= toGw; gw++) {
    const players = new Map<number, PlayerGameweekEntry>();
    const blankPlayerIds: number[] = [];
    const doublePlayerIds: number[] = [];
    let totalFixtures = 0;
    let difficultySum = 0;
    let difficultyCount = 0;
    let totalProjectedPoints = 0;
    let unprojectedCount = 0;
    const playerFixturesThisGw = new Map<number, GwFixtureInfo[]>();

    for (const player of squadPlayers) {
      const teamFixtures = teamGw.get(player.teamId)?.get(gw) ?? [];
      playerFixturesThisGw.set(player.id, teamFixtures);
      totalFixtures += teamFixtures.length;
      if (teamFixtures.length === 0) blankPlayerIds.push(player.id);
      if (teamFixtures.length >= 2) doublePlayerIds.push(player.id);
      for (const f of teamFixtures) {
        difficultySum += f.difficulty;
        difficultyCount += 1;
      }
      const projectedPoints = projectedPointsFor(player, teamFixtures);
      if (projectedPoints === null) unprojectedCount += 1;
      else totalProjectedPoints += projectedPoints;
      players.set(player.id, { playerId: player.id, fixtures: teamFixtures, projectedPoints });
    }

    const clashes = buildSquadClashes(squadPlayers, playerFixturesThisGw);
    let clashPenalty = 0;
    for (const clash of clashes) {
      const sideASum = clash.teamAPlayers.reduce((sum, p) => sum + (players.get(p.id)?.projectedPoints ?? 0), 0);
      const sideBSum = clash.teamBPlayers.reduce((sum, p) => sum + (players.get(p.id)?.projectedPoints ?? 0), 0);
      clashPenalty += 0.2 * Math.min(sideASum, sideBSum);
    }

    profiles.push({
      gw,
      deadline: deadlineByGw.get(gw) ?? null,
      totalFixtures,
      blankPlayerIds,
      doublePlayerIds,
      avgDifficulty: difficultyCount > 0 ? difficultySum / difficultyCount : null,
      totalProjectedPoints: squadPlayers.length > 0 ? totalProjectedPoints - clashPenalty : null,
      unprojectedCount,
      clashes,
      clashPenalty,
      players,
    });
  }
  return profiles;
}

/** First gameweek worth planning for — the current one if it's still open, otherwise the next unplayed one. Falls back to 1 pre-season, or the final event id if the whole season is already finished (an edge case, not the common path). */
export function firstPlannableGw(events: NormalizedEvent[]): number {
  if (events.length === 0) return 1;
  const nextUnplayed = events.find((e) => !e.finished);
  if (nextUnplayed) return nextUnplayed.id;
  return events[events.length - 1].id;
}

function profilesInWindow(profiles: SquadGameweekProfile[], window: ChipWindow): SquadGameweekProfile[] {
  return profiles.filter((p) => p.gw >= window.startEvent && p.gw <= window.stopEvent);
}

export interface ChipRecommendation {
  chip: ChipWindow["chip"];
  half: 1 | 2;
  window: ChipWindow;
  /** Null when the window has already fully passed, or there's no squad/fixture data to work from. */
  gw: number | null;
  reason: string;
  /** Only set for Triple Captain — the squad player the recommendation is built around. */
  playerId?: number;
  playerName?: string;
}

function windowStatus(window: ChipWindow, currentGw: number): "expired" | "open" {
  return window.stopEvent < currentGw ? "expired" : "open";
}

export function recommendBenchBoost(profiles: SquadGameweekProfile[], window: ChipWindow, currentGw: number): ChipRecommendation {
  if (windowStatus(window, currentGw) === "expired") {
    return { chip: "bboost", half: window.half, window, gw: null, reason: `This window closed at Gameweek ${window.stopEvent} without being used.` };
  }
  const inWindow = profilesInWindow(profiles, window);
  if (inWindow.length === 0) {
    return { chip: "bboost", half: window.half, window, gw: null, reason: "No fixture data available for this window yet." };
  }
  const best = [...inWindow].sort((a, b) => {
    if (b.doublePlayerIds.length !== a.doublePlayerIds.length) return b.doublePlayerIds.length - a.doublePlayerIds.length;
    return (b.totalProjectedPoints ?? -Infinity) - (a.totalProjectedPoints ?? -Infinity);
  })[0];
  const doubleNote = best.doublePlayerIds.length > 0 ? `${best.doublePlayerIds.length} squad player(s) have a double gameweek` : "no squad player has a double gameweek here";
  const clashNote = best.clashes.length > 0 ? ` Heads up: ${best.clashes.length} of your squad's fixtures this gameweek pit two of your own players against each other — factored into this ranking as a modest haircut, since both sides rarely return well at once.` : "";
  return {
    chip: "bboost",
    half: window.half,
    window,
    gw: best.gw,
    reason: `Gameweek ${best.gw} has the most total fixtures across your 15 (${best.totalFixtures}) in this window — ${doubleNote}.${clashNote}`,
  };
}

export function recommendFreeHit(profiles: SquadGameweekProfile[], window: ChipWindow, currentGw: number): ChipRecommendation {
  if (windowStatus(window, currentGw) === "expired") {
    return { chip: "freehit", half: window.half, window, gw: null, reason: `This window closed at Gameweek ${window.stopEvent} without being used.` };
  }
  const inWindow = profilesInWindow(profiles, window);
  if (inWindow.length === 0) {
    return { chip: "freehit", half: window.half, window, gw: null, reason: "No fixture data available for this window yet." };
  }
  const best = [...inWindow].sort((a, b) => {
    if (b.blankPlayerIds.length !== a.blankPlayerIds.length) return b.blankPlayerIds.length - a.blankPlayerIds.length;
    return (a.totalProjectedPoints ?? Infinity) - (b.totalProjectedPoints ?? Infinity);
  })[0];
  if (best.blankPlayerIds.length === 0) {
    return {
      chip: "freehit",
      half: window.half,
      window,
      gw: best.gw,
      reason: `No genuine blank gameweek for your squad in this window — Gameweek ${best.gw} is this window's weakest for your squad by projected points, but a blank-gameweek trigger hasn't shown up yet.`,
    };
  }
  return {
    chip: "freehit",
    half: window.half,
    window,
    gw: best.gw,
    reason: `Gameweek ${best.gw} is the biggest blank for your squad in this window — ${best.blankPlayerIds.length} of your 15 have no fixture at all.`,
  };
}

export function recommendTripleCaptain(
  profiles: SquadGameweekProfile[],
  squadPlayers: NormalizedPlayer[],
  window: ChipWindow,
  currentGw: number,
): ChipRecommendation {
  if (windowStatus(window, currentGw) === "expired") {
    return { chip: "3xc", half: window.half, window, gw: null, reason: `This window closed at Gameweek ${window.stopEvent} without being used.` };
  }
  const inWindow = profilesInWindow(profiles, window);
  const playersById = new Map(squadPlayers.map((p) => [p.id, p]));
  let best: { gw: number; playerId: number; points: number } | null = null;
  for (const profile of inWindow) {
    for (const [playerId, entry] of profile.players) {
      if (entry.projectedPoints === null) continue;
      if (!best || entry.projectedPoints > best.points) best = { gw: profile.gw, playerId, points: entry.projectedPoints };
    }
  }
  if (!best) {
    return { chip: "3xc", half: window.half, window, gw: null, reason: "No projectable player/fixture combination found for this window yet." };
  }
  const player = playersById.get(best.playerId);
  const profile = inWindow.find((p) => p.gw === best!.gw)!;
  const entry = profile.players.get(best.playerId)!;
  const doubleNote = entry.fixtures.length >= 2 ? " — a double gameweek for them" : "";
  // Doesn't change the ranking (see SquadGameweekProfile.clashPenalty's own
  // note on why) — but if one of the OTHER squad players is on the
  // opposing side of this specific fixture, that's genuinely useful
  // context: it's a signal that squadmate is less likely to return well
  // this gameweek, not a reason to second-guess the captain pick itself.
  const ownClash = profile.clashes.find((c) => c.teamAPlayers.some((p) => p.id === best!.playerId) || c.teamBPlayers.some((p) => p.id === best!.playerId));
  let clashNote = "";
  if (ownClash) {
    const onOtherSide = (ownClash.teamAPlayers.some((p) => p.id === best!.playerId) ? ownClash.teamBPlayers : ownClash.teamAPlayers).map((p) => p.name);
    if (onOtherSide.length > 0) {
      clashNote = ` Worth noting: ${onOtherSide.join(", ")} (also in your squad) ${onOtherSide.length > 1 ? "are" : "is"} on the opposing side of this exact fixture — doesn't change this pick, but don't expect them to return well in the same match.`;
    }
  }
  return {
    chip: "3xc",
    half: window.half,
    window,
    gw: best.gw,
    playerId: best.playerId,
    playerName: player?.name,
    reason: `${player?.name ?? "This player"} projects highest of anyone in your squad at Gameweek ${best.gw}${doubleNote}, based on today's Exp. Pts baseline scaled by fixture difficulty.${clashNote}`,
  };
}

/**
 * The loosest of the four — Wildcard's value comes from players you don't
 * yet own, not from your current squad's fixtures, so this can only ever
 * be a "your squad's own fixture run is about to get harder" nudge, not a
 * real recommendation. Looks for the first gameweek in the window where a
 * forward-looking 4-gameweek average difficulty is meaningfully worse than
 * the window's own overall average — a genuine fixture-swing signal, but a
 * much weaker one than the other three chips get.
 */
export function recommendWildcard(profiles: SquadGameweekProfile[], window: ChipWindow, currentGw: number): ChipRecommendation {
  if (windowStatus(window, currentGw) === "expired") {
    return { chip: "wildcard", half: window.half, window, gw: null, reason: `This window closed at Gameweek ${window.stopEvent} without being used.` };
  }
  const inWindow = profilesInWindow(profiles, window);
  const withDifficulty = inWindow.filter((p) => p.avgDifficulty !== null);
  if (withDifficulty.length === 0) {
    return { chip: "wildcard", half: window.half, window, gw: null, reason: "No fixture data available for this window yet." };
  }
  const overallAvg = withDifficulty.reduce((s, p) => s + p.avgDifficulty!, 0) / withDifficulty.length;

  let trigger: { gw: number; rollingAvg: number } | null = null;
  for (let i = 0; i < inWindow.length; i++) {
    const slice = inWindow.slice(i, i + 4).filter((p) => p.avgDifficulty !== null);
    if (slice.length === 0) continue;
    const rollingAvg = slice.reduce((s, p) => s + p.avgDifficulty!, 0) / slice.length;
    if (rollingAvg > overallAvg + 0.3) {
      trigger = { gw: inWindow[i].gw, rollingAvg };
      break;
    }
  }

  if (!trigger) {
    return {
      chip: "wildcard",
      half: window.half,
      window,
      gw: null,
      reason: "Your current squad's fixtures don't show a clear hard patch in this window — hold the Wildcard for a genuine need (injuries, a squad rebuild) rather than forcing it on a fixture signal alone.",
    };
  }
  return {
    chip: "wildcard",
    half: window.half,
    window,
    gw: trigger.gw,
    reason: `Your current squad's fixtures get meaningfully tougher from around Gameweek ${trigger.gw} onward — a reasonable trigger point to consider a rebuild, though Wildcard's real value depends on who you'd bring in, which this can't see.`,
  };
}

