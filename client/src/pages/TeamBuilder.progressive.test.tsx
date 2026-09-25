import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import { INITIAL_ROW_COUNT } from "../state/useProgressiveRowCount";
import type { Position } from "../types/normalized";

// The Add Players table draws its first rows at once and the rest over the
// following frames (useProgressiveRowCount). Only the drawing is staged:
// sorting, adding and the Add button's rules still cover every candidate.

const TEAMS = Array.from({ length: 20 }, (_, i) => makeTeam({ id: i + 1, shortName: `T${i + 1}` }));
const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];
const PLAYERS = Array.from({ length: 130 }, (_, i) => {
  const id = i + 1;
  return makePlayer({
    id,
    name: `P${id}`,
    position: POSITIONS[id % 4],
    teamId: (id % 20) + 1,
    teamShortName: `T${(id % 20) + 1}`,
    price: 4,
    totalPoints: 200 - id,
    // Only a player far outside the first staged rows has any goals.
    goals: id === 120 ? 9 : 0,
  });
});

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    historicProfiles: new Map(),
    historicStatus: "ready",
    currentSeasonHasStarted: true,
    gameweekState: null,
    requestHistoricData: () => {},
  }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  localStorage.clear();
  saveVersioned("fpl-dashboard:saved-squads:v1", 1, [
    { id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds: [], startingXI: [], captainId: null, viceCaptainId: null, usedChips: [], importedFrom: null },
  ]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderBuilder() {
  const utils = render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
  // The picker's own Historic/Raw toggle → the fixture players' live figures.
  fireEvent.click(utils.getAllByRole("button", { name: "Current Season" }).at(-1)!);
  return utils;
}

function drawAllFrames() {
  for (let i = 0; i < 10; i++) {
    act(() => {
      vi.advanceTimersToNextFrame();
    });
  }
}

function pickerRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact tbody tr")).filter((tr) => tr.querySelector("td.picker-sticky-player"));
}

function pickerNames(container: HTMLElement): string[] {
  return pickerRows(container).map((tr) => tr.querySelector(".name")?.textContent?.trim() ?? "");
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact thead th")).find((el) => el.childNodes[0]?.textContent?.trim() === label);
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

function addButton(container: HTMLElement, name: string): HTMLButtonElement {
  const row = pickerRows(container).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name);
  if (!row) throw new Error(`${name} isn't drawn`);
  return row.querySelector<HTMLButtonElement>("button.inline-add-btn")!;
}

describe("Team Building — staged drawing of the Add Players table", () => {
  it("draws the first rows at once and the rest without any scrolling", () => {
    const { container } = renderBuilder();
    expect(pickerRows(container)).toHaveLength(INITIAL_ROW_COUNT);
    drawAllFrames();
    expect(pickerRows(container)).toHaveLength(130);
  });

  it("a sort made before every row is drawn still sorts all candidates", () => {
    const { container } = renderBuilder();
    fireEvent.click(header(container, "Goals")); // first click: highest first
    expect(pickerNames(container)[0]).toBe("P120");
  });

  it("Add moves the player into the squad and out of the table, with every other row still there", () => {
    const { container } = renderBuilder();
    drawAllFrames();
    fireEvent.click(addButton(container, "P1"));
    expect(pickerNames(container)).not.toContain("P1");
    expect(pickerRows(container)).toHaveLength(129);
  });

  it("rows already drawn pick up a new reason their Add button is disabled", () => {
    const { container } = renderBuilder();
    drawAllFrames();
    // Two goalkeepers fill the GKP slots (P4, P8 are GKP: id % 4 === 0).
    fireEvent.click(addButton(container, "P4"));
    expect(addButton(container, "P12").disabled).toBe(false);
    fireEvent.click(addButton(container, "P8"));
    const blocked = addButton(container, "P12");
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe("GKP slots full (2/2)");
    expect(addButton(container, "P1").disabled).toBe(false);
  });
});
