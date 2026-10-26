import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { addPlayersCell, openAddPlayers } from "../test/addPlayers";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { ClubSeason, NormalizedFixture } from "../types/normalized";

// Model Predicted in Add Players (<points_model>): a figure from the club
// records and each player's matches this season, "—" with a hover saying
// why for a player whose matches didn't load.

const TEAMS = [1, 2].map((id) => makeTeam({ id, shortName: ["ARS", "CHE"][id - 1], played: 4 }));
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 360, starts: 4, goals: 2, xG: 1.6, xA: 1.1, assists: 1, bonus: 4, epNext: 5, status: "a" }),
  makePlayer({ id: 2, name: "Palmer", position: "MID", teamId: 2, teamShortName: "CHE", minutes: 360, starts: 4, goals: 1, xG: 1.2, epNext: 4, status: "a" }),
];
const FIXTURES: NormalizedFixture[] = [
  { id: 9, eventId: 5, homeTeamId: 1, awayTeamId: 2, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 4 },
];
// Four played matches between the two clubs this season, Arsenal the stronger.
const clubSeason = (code: number, opponentCode: number, forGoals: number, againstGoals: number): ClubSeason =>
  ({
    season: "2026/27",
    code,
    complete: false,
    played: 4,
    goalsFor: 4 * forGoals,
    goalsAgainst: 4 * againstGoals,
    matches: [1, 2, 3, 4].map((event) => ({ event, opponentCode, home: event % 2 === 1, goalsFor: forGoals, goalsAgainst: againstGoals, xG: forGoals, xGC: againstGoals })),
  }) as unknown as ClubSeason;
const CLUB_SEASONS = [clubSeason(101, 102, 2, 1), clubSeason(102, 101, 1, 2)];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [{ id: 5, isNext: true }],
    historicProfiles: new Map(),
    clubSeasons: CLUB_SEASONS,
    historicReferenceSeason: "2025/26",
    historicFetchSkippedPlayerIds: [],
    historicSkippedPlayerIds: [],
    historicErrorMessage: null,
    historicRefreshing: false,
    refreshHistoricData: () => {},
    advancedFieldAvailability: null,
    // Palmer's matches didn't load (the historic build skipped him).
    seasonMatchesByPlayerId: new Map([[1, [1, 2, 3, 4].map(() => ({ started: true, minutes: 90 }))]]),
    historicStatus: "ready",
    currentSeasonHasStarted: true,
    gameweekState: null,
    requestHistoricData: () => {},
  }),
}));

beforeEach(() => {
  localStorage.clear();
  saveVersioned("fpl-dashboard:saved-squads:v1", 1, [
    { id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds: [], startingXI: [], captainId: null, viceCaptainId: null, usedChips: [], importedFrom: null },
  ]);
});
afterEach(cleanup);

const modelCell = (container: HTMLElement, name: string) => addPlayersCell(container, "Exp. Pts (Model Predicted)", name);

function renderBuilder() {
  const utils = render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
  openAddPlayers(utils);
  return utils;
}

describe("Team Building — Model Predicted", () => {
  it("shows the model's figure, its parts and his chance of starting in the hover", () => {
    const { container } = renderBuilder();
    const saka = modelCell(container, "Saka")!;
    expect(Number(saka.textContent)).toBeGreaterThan(1);
    // <stat_hover>: what the column is, then his figure in parts (his percentile follows when others in his position have a figure).
    const lines = saka.title.split("\n");
    expect(lines[0]).toMatch(/^Exp\. Pts \(Model Predicted\): /);
    expect(lines[1]).toMatch(/^Scoutline's model v CHE \(H\): \d+\.\d pts = appearance/);
    expect(saka.title).toContain("chance of starting");
  });
  it("a player whose matches didn't load has no figure, and the hover says why", () => {
    const { container } = renderBuilder();
    const palmer = modelCell(container, "Palmer")!;
    expect(palmer.textContent).toBe("—");
    expect(palmer.title).toContain("Scoutline's model has no figure");
  });
  it("<expected_minutes> Exp. Mins is always the next gameweek's, whatever Exp. Pts adds up", () => {
    const { container } = renderBuilder();
    const minutes = addPlayersCell(container, "Exp. Mins", "Saka")!;
    expect(Number(minutes.textContent)).toBeGreaterThan(0);
    expect(minutes.title.split("\n")[0]).toMatch(/^Exp\. Mins: /);
    expect(minutes.title.split("\n")[1]).toMatch(/^About \d+ minutes expected in GW\d+/);
    expect(addPlayersCell(container, "Exp. Mins", "Palmer")!.textContent).toBe("—");
  });
});
