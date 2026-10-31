import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { fixedFloorMinutes } from "../metrics/fixedMinutesFloor";

// <stat_hover> on Player Explorer (owner's rule, 2026-10-26): every figure
// says what the statistic is, then where it ranks within his position — or
// why there's no rank. And the table's always-live block (Own%, Price,
// Team, Position, then Next 5 Fixtures) ends at the divider where the Data
// View's columns start.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 6 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 2 }),
  makePlayer({ id: 3, name: "Odegaard", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 1 }),
  // A 60-minute cameo: under Current Season's floor.
  makePlayer({ id: 4, name: "Nwaneri", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 60, goals: 3 }),
  makePlayer({ id: 5, name: "Gabriel", position: "DEF", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 2 }),
  makePlayer({ id: 6, name: "Saliba", position: "DEF", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 0 }),
  makePlayer({ id: 7, name: "Timber", position: "DEF", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 0 }),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    advancedFieldAvailability: null,
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicFetchSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

afterEach(cleanup);

function renderCurrentSeason() {
  const utils = render(
    <MemoryRouter initialEntries={["/players"]}>
      <PlayerExplorer />
    </MemoryRouter>,
  );
  fireEvent.click(utils.getByRole("button", { name: "Current Season" }));
  return utils;
}

const headers = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th"));
const headerText = (th: HTMLElement) => th.childNodes[0]?.textContent?.trim();

function cell(container: HTMLElement, column: string, name: string): HTMLElement {
  const index = headers(container).findIndex((th) => headerText(th) === column);
  const row = Array.from(container.querySelectorAll("table.data-table tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name)!;
  return row.querySelectorAll<HTMLElement>("td")[index];
}

describe("Player Explorer — every figure says what it is, then where it ranks (<stat_hover>)", () => {
  it("a cell's hover is its column's meaning, then his percentile within his position", () => {
    const { container } = renderCurrentSeason();
    // Gabriel: top of 3 defenders → (2 + ½) ÷ 3 = 83rd percentile.
    expect(cell(container, "Goals", "Gabriel").getAttribute("title")).toBe("Goals: Goals scored.\n83rd percentile of defenders: top 17%");
    // The header says the same first line.
    expect(headers(container).find((th) => headerText(th) === "Goals")!.getAttribute("title")).toBe("Goals: Goals scored.");
  });

  it("a player under the floor has no percentile, and his hover says why", () => {
    const { container } = renderCurrentSeason();
    expect(cell(container, "Goals", "Nwaneri").getAttribute("title")).toBe(
      `Goals: Goals scored.\nNo percentile: under the ${fixedFloorMinutes("live")}-minute floor, a small sample`,
    );
  });

  it("a lower-is-better figure ranks the cheapest highest, and says lower is better", () => {
    const { container } = renderCurrentSeason();
    const lines = cell(container, "Price", "Saka").getAttribute("title")!.split("\n");
    expect(lines[0]).toBe("Price: FPL price today.");
    expect(lines[1]).toBe("Lower is better. Today's figure, whatever the Data View.");
    expect(lines[2]).toMatch(/^\d+(st|nd|rd|th) percentile of midfielders: /);
  });
});

describe("Player Explorer — the always-live block ends at the divider (Next 5 Fixtures included)", () => {
  it("Next 5 Fixtures, when shown, sits straight after Price, and the divider moves to the right of it", () => {
    const { container, getByRole } = renderCurrentSeason();
    fireEvent.click(getByRole("button", { name: /^Columns \(/ }));
    fireEvent.click(getByRole("checkbox", { name: "Next 5 Fixtures" }));
    const names = headers(container).map(headerText);
    const position = names.indexOf("Price");
    expect(names[position + 1]).toBe("Next 5 Fixtures");
    const fixtures = headers(container)[position + 1];
    // Not a Data View column: no divider on it, and it can't be dragged among them.
    expect(fixtures.classList.contains("column-group-divider")).toBe(false);
    expect(fixtures.getAttribute("draggable")).toBeNull();
    // The divider is on the first column the Data View drives.
    const first = headers(container)[position + 2];
    expect(headerText(first)).toBe("Points");
    expect(first.classList.contains("column-group-divider")).toBe(true);
  });

  it("without Next 5 Fixtures the divider sits right after Price", () => {
    const { container } = renderCurrentSeason();
    const names = headers(container).map(headerText);
    const next = headers(container)[names.indexOf("Price") + 1];
    expect(headerText(next)).toBe("Points");
    expect(next.classList.contains("column-group-divider")).toBe(true);
  });
});
