import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
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

function modelCell(container: HTMLElement, name: string): HTMLElement | undefined {
  const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact thead th"));
  const index = headers.findIndex((th) => th.childNodes[0]?.textContent?.trim() === "Exp. Pts (Model Predicted)");
  const row = Array.from(container.querySelectorAll("table.data-table.compact tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name);
  return row?.querySelectorAll<HTMLElement>("td")[index];
}

describe("Team Building — Model Predicted", () => {
  it("shows the model's figure, its parts and his chance of starting in the hover", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/team-building"]}>
        <TeamBuilder />
      </MemoryRouter>,
    );
    const saka = modelCell(container, "Saka")!;
    expect(Number(saka.textContent)).toBeGreaterThan(1);
    expect(saka.title).toMatch(/^Scoutline's model v CHE \(H\): \d+\.\d pts = appearance/);
    expect(saka.title).toContain("chance of starting");
  });
  it("a player whose matches didn't load has no figure, and the hover says why", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/team-building"]}>
        <TeamBuilder />
      </MemoryRouter>,
    );
    const palmer = modelCell(container, "Palmer")!;
    expect(palmer.textContent).toBe("—");
    expect(palmer.title).toContain("Scoutline's model has no figure");
  });
});
