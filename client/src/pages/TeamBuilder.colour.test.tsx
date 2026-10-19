import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import { percentileTint } from "../utils/colorScale";

// <comparative_colouring> on Team Building's Add Players table: each player
// ranked within his position among every player — never only the rows the
// filters, search or squad leave — and no colour under the fixed floor.

// 10 played, so Minutes Reliability (live minutes over the club's games) has a figure.
const TEAMS = [makeTeam({ id: 1, shortName: "ARS", played: 10 })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 6 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 2 }),
  makePlayer({ id: 3, name: "Odegaard", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 1 }),
  makePlayer({ id: 4, name: "Nwaneri", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 60, goals: 3 }),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    events: [],
    historicProfiles: new Map(),
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
  fireEvent.click(utils.getAllByRole("button", { name: "Current Season" }).at(-1)!);
  return utils;
}

function asRendered(css: string | undefined): string {
  const el = document.createElement("div");
  if (css) el.style.background = css;
  return el.style.backgroundColor;
}

function goalsCell(container: HTMLElement, name: string): HTMLElement | undefined {
  const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact thead th"));
  const index = headers.findIndex((th) => th.childNodes[0]?.textContent?.trim() === "Goals");
  const row = Array.from(container.querySelectorAll("table.data-table.compact tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name);
  return row?.querySelectorAll<HTMLElement>("td")[index];
}

describe("Team Building — Add Players comparative colouring", () => {
  it("ranks within position over every player; the cameo is uncoloured and left out", () => {
    const { container } = renderBuilder();
    expect(goalsCell(container, "Saka")!.style.backgroundColor).toBe(asRendered(percentileTint((2.5 / 3) * 100)));
    expect(goalsCell(container, "Nwaneri")!.style.backgroundColor).toBe("");
  });

  it("M20: a forward-looking column has no minutes floor — the cameo's Minutes Reliability is coloured though his Goals aren't; his row carries the amber stopwatch", () => {
    const { container } = renderBuilder();
    const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact thead th"));
    const index = headers.findIndex((th) => th.childNodes[0]?.textContent?.trim() === "Minutes Reliability");
    const row = Array.from(container.querySelectorAll("table.data-table.compact tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === "Nwaneri")!;
    expect(index).toBeGreaterThan(0);
    expect(row.querySelectorAll<HTMLElement>("td")[index].style.backgroundColor).not.toBe("");
    expect(goalsCell(container, "Nwaneri")!.style.backgroundColor).toBe("");
    expect(row.querySelector(".small-sample-badge")!.getAttribute("title")).toContain("60 min in this mode, under the 90-minute floor");
  });

  it("Min minutes works in Current Season, marks itself with the stopwatch, and counts no minutes as 0", () => {
    const { container } = renderBuilder();
    const box = container.querySelector<HTMLInputElement>("#picker-min-minutes")!;
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "90" } });
    expect(goalsCell(container, "Nwaneri")).toBeUndefined();
    expect(goalsCell(container, "Saka")).toBeDefined();
    expect(container.querySelector('label[for="picker-min-minutes"] .small-sample-badge')!.getAttribute("title")).toContain("Your minimum minutes: 90");
  });

  it("a search, or adding a player to the squad, doesn't change anyone's colour", () => {
    const { container } = renderBuilder();
    const before = goalsCell(container, "Odegaard")!.style.backgroundColor;
    expect(before).not.toBe("");
    const addSaka = Array.from(container.querySelectorAll("table.data-table.compact tbody tr"))
      .find((tr) => tr.querySelector(".name")?.textContent?.trim() === "Saka")!
      .querySelector<HTMLButtonElement>("button.inline-add-btn")!;
    fireEvent.click(addSaka);
    expect(goalsCell(container, "Saka")).toBeUndefined();
    expect(goalsCell(container, "Odegaard")!.style.backgroundColor).toBe(before);
    fireEvent.change(container.querySelector("#picker-search")!, { target: { value: "odegaard" } });
    expect(goalsCell(container, "Odegaard")!.style.backgroundColor).toBe(before);
  });
});
