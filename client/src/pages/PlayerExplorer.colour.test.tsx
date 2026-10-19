import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { percentileTint } from "../utils/colorScale";

// <comparative_colouring> on Player Explorer (owner's decision, 2026-10-19):
// a cell's colour is the player's rank within his position among the whole
// pool for the Data View, never only the rows on screen; under the fixed
// floor, no colour.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 6 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 2 }),
  makePlayer({ id: 3, name: "Odegaard", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, goals: 1 }),
  // A 60-minute cameo with 3 goals: under Current Season's 90-minute floor.
  makePlayer({ id: 4, name: "Nwaneri", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 60, goals: 3 }),
  // A defender with 2 goals among defenders with none: green, though fewer than the midfielders'.
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

/** A cell's background as jsdom stores it, so it compares with percentileTint's output. */
function asRendered(css: string | undefined): string {
  const el = document.createElement("div");
  if (css) el.style.background = css;
  return el.style.backgroundColor;
}

function goalsCell(container: HTMLElement, name: string): HTMLElement {
  const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th"));
  const index = headers.findIndex((th) => th.childNodes[0]?.textContent?.trim() === "Goals");
  const row = Array.from(container.querySelectorAll("table.data-table tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name)!;
  return row.querySelectorAll<HTMLElement>("td")[index];
}

describe("Player Explorer — comparative colouring", () => {
  it("ranks each player within his position: the defenders' top scorer is green with fewer goals than a red midfielder", () => {
    const { container } = renderCurrentSeason();
    // Gabriel: top of 3 defenders → (2 + ½) ÷ 3.
    expect(goalsCell(container, "Gabriel").style.backgroundColor).toBe(asRendered(percentileTint((2.5 / 3) * 100)));
    // Rice: 2 goals, middle of the 3 qualifying midfielders → 50th, no colour.
    expect(goalsCell(container, "Rice").style.backgroundColor).toBe("");
    // Odegaard: bottom of the midfielders → red.
    expect(goalsCell(container, "Odegaard").style.backgroundColor).toBe(asRendered(percentileTint((0.5 / 3) * 100)));
  });

  it("a player under the fixed floor has no colour and doesn't count in anyone's", () => {
    const { container } = renderCurrentSeason();
    expect(goalsCell(container, "Nwaneri").style.backgroundColor).toBe("");
    // Saka tops the 3 qualifying midfielders; the cameo's 3 goals don't share the pool.
    expect(goalsCell(container, "Saka").style.backgroundColor).toBe(asRendered(percentileTint((2.5 / 3) * 100)));
  });

  it("a player under the floor says why on his row: the amber small-sample marker (<minutes_marker>)", () => {
    const { container } = renderCurrentSeason();
    const rowOf = (name: string) => Array.from(container.querySelectorAll("table.data-table tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name)!;
    const badge = rowOf("Nwaneri").querySelector(".small-sample-badge");
    expect(badge?.getAttribute("title")).toBe("Small sample: 60 min in this mode, under the 90-minute floor: its figures for this Data View have no percentiles or colours.");
    expect(rowOf("Saka").querySelector(".small-sample-badge")).toBeNull();
  });

  it("narrowing the table doesn't change a colour: it's against the whole pool, not the rows on screen", () => {
    const { container, getByLabelText } = renderCurrentSeason();
    const before = goalsCell(container, "Odegaard").style.backgroundColor;
    fireEvent.change(getByLabelText("Search players"), { target: { value: "odegaard" } });
    expect(goalsCell(container, "Odegaard").style.backgroundColor).toBe(before);
    expect(before).not.toBe("");
  });
});

describe("Player Explorer — <hide_small_samples>", () => {
  const names = (container: HTMLElement) => Array.from(container.querySelectorAll("table.data-table tbody tr .name")).map((n) => n.textContent?.trim());

  it("the Hide button leaves out the players under the minutes threshold, and Clear filters brings them back", () => {
    const { container, getByRole } = renderCurrentSeason();
    expect(names(container)).toContain("Nwaneri");
    fireEvent.click(getByRole("button", { name: "Hide the 1 player under the 90-minute floor (marked with the amber stopwatch)" }));
    expect(names(container)).not.toContain("Nwaneri");
    expect(names(container)).toContain("Saka");
    // Still there, pressed, so it can be turned off.
    expect(getByRole("button", { name: /Show the players under the 90-minute floor again/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByRole("button", { name: /Clear every filter/ }));
    expect(names(container)).toContain("Nwaneri");
  });

  it("<marker_follows_data>: in Historic Average the Data View stopwatch is amber while a player under the threshold is shown, grey once they're hidden", () => {
    const { container, getByRole } = render(
      <MemoryRouter initialEntries={["/players"]}>
        <PlayerExplorer />
      </MemoryRouter>,
    );
    fireEvent.click(getByRole("button", { name: "Historic Average" }));
    const badge = () => container.querySelector(".data-view-picker .minutes-floor-badge")!;
    // No historic profiles in this pool: nobody has a 450+ season, so everyone is under it.
    expect(badge().classList.contains("small-sample-badge")).toBe(true);
    fireEvent.click(getByRole("button", { name: /^Hide the 7 players/ }));
    expect(badge().classList.contains("small-sample-badge")).toBe(false);
  });
});
