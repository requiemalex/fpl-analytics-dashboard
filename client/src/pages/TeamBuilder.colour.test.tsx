import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import { percentileTint } from "../utils/colorScale";
import { addButton, addPlayersCell, addPlayersHeader, addPlayersRow, openAddPlayers } from "../test/addPlayers";

// <comparative_colouring> on Team Building's Add Players table: each player
// ranked within his position among every player — never only the rows the
// filters, search or squad leave — and no colour under the fixed floor.

// One upcoming match (GW1 v CHE), so the forward-looking Exp. Pts has a figure.
const TEAMS = [makeTeam({ id: 1, shortName: "ARS", played: 10 }), makeTeam({ id: 2, shortName: "CHE", played: 10 })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 6, epNext: 5 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 2, epNext: 4 }),
  makePlayer({ id: 3, name: "Odegaard", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 1, epNext: 3 }),
  makePlayer({ id: 4, name: "Nwaneri", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 60, goals: 3, epNext: 2 }),
];
const FIXTURES = [{ id: 1, eventId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 3 }];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [{ id: 1, isNext: true }],
    historicProfiles: new Map(),
    clubSeasons: [],
    historicReferenceSeason: null,
    historicFetchSkippedPlayerIds: [],
    historicSkippedPlayerIds: [],
    historicErrorMessage: null,
    historicRefreshing: false,
    refreshHistoricData: () => {},
    advancedFieldAvailability: null,
    seasonMatchesByPlayerId: new Map(),
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

function renderBuilder() {
  const utils = render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
  openAddPlayers(utils);
  fireEvent.click(utils.getAllByRole("button", { name: "Current Season" }).at(-1)!);
  return utils;
}

function asRendered(css: string | undefined): string {
  const el = document.createElement("div");
  if (css) el.style.background = css;
  return el.style.backgroundColor;
}

const goalsCell = (container: HTMLElement, name: string) => addPlayersCell(container, "Goals", name);

describe("Team Building — Add Players comparative colouring", () => {
  it("uses the Explorers' colour index on its FPL headers and Columns headings: green when following the Data View, muted red when always live", () => {
    const { container, getByRole } = renderBuilder();
    expect(addPlayersHeader(container, "Goals")!.classList.contains("col-source-fpl")).toBe(true);
    expect(addPlayersHeader(container, "Own%")!.classList.contains("col-static")).toBe(true);
    expect(addPlayersHeader(container, "Own%")!.classList.contains("col-source-fpl")).toBe(false);
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    const heading = Array.from(container.querySelectorAll(".popover .menu-group-heading")).find((h) => h.textContent === "FPL · Actual Output")!;
    expect(heading.classList.contains("col-source-fpl")).toBe(true);
  });

  it("ranks within position over every player; the cameo is uncoloured and left out", () => {
    const { container } = renderBuilder();
    expect(goalsCell(container, "Saka")!.style.backgroundColor).toBe(asRendered(percentileTint((2.5 / 3) * 100)));
    expect(goalsCell(container, "Nwaneri")!.style.backgroundColor).toBe("");
  });

  it("M20: a forward-looking column has no minutes floor — the cameo's Exp. Pts is coloured though his Goals aren't; his row carries the amber stopwatch", () => {
    const { container } = renderBuilder();
    expect(addPlayersCell(container, "Exp. Pts (FPL Official)", "Nwaneri")!.style.backgroundColor).not.toBe("");
    expect(goalsCell(container, "Nwaneri")!.style.backgroundColor).toBe("");
    expect(addPlayersRow(container, "Nwaneri")!.querySelector(".small-sample-badge")!.getAttribute("title")).toContain("60 min in this mode, under the 90-minute floor");
  });

  it("a search, or adding a player to the squad, doesn't change anyone's colour", () => {
    const utils = renderBuilder();
    const { container } = utils;
    const before = goalsCell(container, "Odegaard")!.style.backgroundColor;
    expect(before).not.toBe("");
    fireEvent.click(addButton(container, "Saka"));
    // Adding closes Add Players; it opens again as it was left.
    expect(container.querySelector<HTMLElement>(".add-players-backdrop")!.hidden).toBe(true);
    openAddPlayers(utils);
    expect(goalsCell(container, "Saka")).toBeUndefined();
    expect(goalsCell(container, "Odegaard")!.style.backgroundColor).toBe(before);
    fireEvent.change(container.querySelector("#picker-search")!, { target: { value: "odegaard" } });
    expect(goalsCell(container, "Odegaard")!.style.backgroundColor).toBe(before);
  });
});
