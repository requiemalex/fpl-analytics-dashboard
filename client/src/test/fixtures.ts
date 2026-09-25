import type { NormalizedPlayer, NormalizedTeam, Position, PlayerSeasonHistory } from "../types/normalized";
import { estimatedGamesFromMinutes } from "../metrics/calculations";

/** Shared builder for a fully-populated NormalizedPlayer, so individual test files only need to specify the fields they care about. Not imported by any production code. */
export function makePlayer(overrides: Partial<NormalizedPlayer> & { id: number; position: Position }): NormalizedPlayer {
  const player: NormalizedPlayer = {
    code: 1000 + overrides.id,
    name: `Player ${overrides.id}`,
    firstName: "First",
    lastName: "Last",
    teamId: 1,
    teamName: "Team",
    teamShortName: "TM",
    price: 5,
    ownership: 10,
    totalPoints: 0,
    pointsPerGame: null,
    epNext: null,
    minutes: 900,
    estimatedGames: null,
    starts: null,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    bonus: 0,
    bps: 0,
    ictIndex: null,
    saves: null,
    savesPerGame: null,
    xG: null,
    xA: null,
    xGI: null,
    xGC: null,
    xGPerGame: null,
    xAPerGame: null,
    xGIPerGame: null,
    xGCPerGame: null,
    defensiveContributions: null,
    defensiveContributionsPerGame: null,
    status: "a",
    news: "",
    chanceOfPlayingNextRound: null,
    form: null,
    transfersInEvent: null,
    transfersOutEvent: null,
    transfersInTotal: null,
    transfersOutTotal: null,
    costChangeEvent: null,
    costChangeStart: null,
    priceChange: null,
    ...overrides,
  };
  // Games follow minutes, as normalizePlayers sets them, unless a test gives its own.
  if (overrides.estimatedGames === undefined) player.estimatedGames = player.minutes === null ? null : estimatedGamesFromMinutes(player.minutes);
  return player;
}

export function makeTeam(overrides: Partial<NormalizedTeam> & { id: number }): NormalizedTeam {
  return {
    code: 100 + overrides.id,
    name: `Team ${overrides.id}`,
    shortName: `T${overrides.id}`,
    position: null,
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    unavailable: false,
    strengthOverallHome: null,
    strengthOverallAway: null,
    ...overrides,
  };
}

export function makeSeason(overrides: Partial<PlayerSeasonHistory> & { seasonName: string }): PlayerSeasonHistory {
  return {
    totalPoints: 0,
    minutes: 0,
    starts: null,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    bonus: 0,
    bps: 0,
    ictIndex: null,
    startCost: null,
    endCost: null,
    xG: null,
    xA: null,
    xGI: null,
    xGC: null,
    defensiveContribution: null,
    ...overrides,
  };
}
