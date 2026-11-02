import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { ChipWindow, Position } from "../types/normalized";
import { addButton, openAddPlayers } from "../test/addPlayers";

// <squad_transfers> and <squad_chips> on the real page, with the saved-squads store.

const TEAMS = [1, 2, 3, 4, 5, 6, 7].map((id) => makeTeam({ id, shortName: `C${id}`, played: 10 }));
const POSITIONS: Position[] = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
const PLAYERS = [
  ...POSITIONS.map((position, i) => makePlayer({ id: i + 1, name: `P${i + 1}`, position, teamId: Math.floor(i / 3) + 1, price: 5, minutes: 900, epNext: 2 })),
  makePlayer({ id: 16, name: "Newcomer", position: "MID", teamId: 6, price: 5, minutes: 900, epNext: 3 }),
  makePlayer({ id: 17, name: "Another", position: "MID", teamId: 7, price: 5, minutes: 900, epNext: 3 }),
];
const FIXTURES = [1, 3, 5].map((home, i) => ({ id: i + 1, eventId: 1, homeTeamId: home, awayTeamId: home + 1, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 3 }));
const CHIPS: ChipWindow[] = [
  { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
  { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
  { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
  { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    chips: CHIPS,
    liveDataVersion: { count: 1, forced: false },
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [{ id: 1, isNext: true, deadlineTime: "2099-01-01T00:00:00Z" }],
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

const STORE = "fpl-dashboard:saved-squads:v1";
const stored = () => (JSON.parse(localStorage.getItem(STORE)!) as { data: Record<string, unknown>[] }).data[0];
const IDS = POSITIONS.map((_, i) => i + 1);
const XI = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];

beforeEach(() => {
  localStorage.clear();
  saveVersioned(STORE, 6, [
    { id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds: IDS, startingXI: XI, captainId: 13, viceCaptainId: 14, purchasePrices: {}, usedChips: [], transfers: null, gameweekLog: [], importedFrom: null },
  ]);
});
afterEach(cleanup);

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
}

const figure = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll(".squad-summary-figures > .squad-summary-figure")].find((f) => f.querySelector(".squad-summary-label")?.textContent === label) as HTMLElement;

describe("Team Building — Transfers (<squad_transfers>)", () => {
  it("sits with Squad Value and Bank; a squad built here starts unlimited, is set by hand, then counts each transfer and the hit past the free ones until confirmed", () => {
    const utils = renderBuilder();
    const { container, getByRole } = utils;
    const transfers = () => figure(container, "Transfers");
    expect([...container.querySelectorAll(".squad-summary-figures > .squad-summary-figure > .squad-summary-label, .squad-summary-figures > .squad-summary-figure > .squad-summary-button > .squad-summary-label")].map((l) => l.textContent)).toEqual([
      "Captain",
      "Squad Value",
      "Bank",
      "Transfers",
      "Chips",
    ]);
    // Unlimited: drawn, not typed.
    expect(transfers().querySelector(".squad-summary-value svg")).toBeTruthy();

    fireEvent.click(within(transfers()).getByRole("button", { name: /^Transfers/ }));
    fireEvent.click(getByRole("radio", { name: "1 free transfer" }));
    expect(stored().transfers).toEqual(expect.objectContaining({ event: 1, free: 1, made: 0, baseIds: IDS }));
    expect(transfers().querySelector(".squad-summary-value")!.textContent).toBe("1");

    // Two out, two in, on one free transfer: −4.
    fireEvent.click(getByRole("button", { name: "Remove P8 from the squad" }));
    fireEvent.click(getByRole("button", { name: "Remove P9 from the squad" }));
    openAddPlayers(utils, "midfielder");
    fireEvent.click(addButton(container, "Newcomer"));
    openAddPlayers(utils, "midfielder");
    fireEvent.click(addButton(container, "Another"));
    expect(transfers().querySelector(".squad-summary-value")!.textContent).toBe("0−4");

    fireEvent.click(within(transfers()).getByRole("button", { name: "Confirm transfers" }));
    expect(stored().transfers).toEqual(expect.objectContaining({ made: 2, baseIds: expect.arrayContaining([16, 17]) }));
    // Still −4: confirmed transfers count.
    expect(transfers().querySelector(".squad-summary-value")!.textContent).toBe("0−4");
    expect(within(transfers()).queryByRole("button", { name: "Confirm transfers" })).toBeNull();
  });
});

describe("Team Building — Chips (<squad_chips>)", () => {
  it("plays Triple Captain for the gameweek open for picks: saved, and the captain's figure tripled", () => {
    const { container, getByRole } = renderBuilder();
    const captain = () => container.querySelector(".squad-summary-captain .squad-summary-value")!.textContent;
    expect(captain()).toBe("4.0");
    fireEvent.click(within(figure(container, "Chips")).getByRole("button", { name: /^Chips/ }));
    // No Wildcard in GW1: its window opens at GW2.
    expect(getByRole("button", { name: "Wildcard" })).toHaveProperty("disabled", true);
    fireEvent.click(getByRole("button", { name: "Triple Captain" }));
    expect(stored().transfers).toEqual(expect.objectContaining({ event: 1, chip: "3xc" }));
    expect(captain()).toBe("6.0");
  });

  it("marks a chip already used this half by hand", () => {
    const { container, getAllByRole } = renderBuilder();
    fireEvent.click(within(figure(container, "Chips")).getByRole("button", { name: /^Chips/ }));
    // Bench Boost is the first chip playable in GW1 with a box to tick.
    fireEvent.click(getAllByRole("checkbox")[0]);
    expect(stored().usedChips).toEqual([{ chip: "bboost", event: null, half: 1 }]);
  });
});

describe("Team Building — no Gameweek Log section", () => {
  it("has the log in the Gameweek Summary panel instead, opened from the pitch's icon", () => {
    const { queryByText, getByRole } = renderBuilder();
    expect(queryByText("Gameweek Log")).toBeNull();
    expect(getByRole("button", { name: "Gameweek Summary" })).toHaveProperty("disabled", true);
  });
});

describe("Team Building — Reset Draft (<reset_draft>)", () => {
  it("sits between Clear Draft and Best Draft, asks first, then puts the squad back as it was after the last deadline", () => {
    const start = { playerIds: IDS, startingXI: XI, captainId: 13, viceCaptainId: 14, purchasePrices: {} };
    // P8 and P9 sold for Newcomer and Another since the deadline, one of them confirmed; Newcomer captained.
    const now = IDS.map((id) => (id === 8 ? 16 : id === 9 ? 17 : id));
    saveVersioned(STORE, 6, [
      {
        id: "s1",
        name: "Test",
        createdAt: 0,
        updatedAt: 0,
        playerIds: now,
        startingXI: XI.map((id) => (id === 8 ? 16 : id === 9 ? 17 : id)),
        captainId: 16,
        viceCaptainId: 14,
        purchasePrices: { 16: 5, 17: 5 },
        usedChips: [],
        transfers: { event: 1, free: 1, made: 1, baseIds: IDS.map((id) => (id === 8 ? 16 : id)), start, chip: null },
        gameweekLog: [],
        importedFrom: null,
      },
    ]);
    const { container, getByRole, queryByText } = renderBuilder();
    expect([...container.querySelectorAll(".pitch-view-actions button")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Captain",
      "Vice-Captain",
      "Clear Draft",
      "Reset Draft",
      "Best Draft",
      "Gameweek Summary",
    ]);
    const reset = getByRole("button", { name: "Reset Draft" });
    expect(reset).toHaveProperty("disabled", false);
    fireEvent.click(reset);
    // Asks first: Cancel leaves the squad as it is.
    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(stored().playerIds).toEqual(now);
    fireEvent.click(reset);
    fireEvent.click(getByRole("button", { name: "Reset" }));
    expect(queryByText("Reset draft")).toBeNull();
    expect(stored()).toEqual(expect.objectContaining({ ...start, transfers: expect.objectContaining({ made: 0, baseIds: IDS }) }));
    // Nothing left to undo.
    expect(getByRole("button", { name: "Reset Draft" })).toHaveProperty("disabled", true);
  });

  it("is greyed out for a squad built here before its first deadline", () => {
    const { getByRole } = renderBuilder();
    const reset = getByRole("button", { name: "Reset Draft" });
    expect(reset).toHaveProperty("disabled", true);
    expect(reset.getAttribute("title")).toMatch(/nothing to go back to yet/);
  });
});
