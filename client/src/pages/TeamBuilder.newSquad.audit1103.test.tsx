import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { createBlankSquad, type SavedSquad } from "../types/team";
import { isValidFplTeamId } from "../state/fplTeamImport";
import { isValidTeamId as serverIsValidTeamId } from "../../../server/src/teamId";

// Audit 2026-11-03 (M2, M3, M4, L4, L5): the New Squad dialog imports once
// however often Enter is pressed, drops an import cancelled mid-way, caps the
// name at 60 like every other name box, and checks a team ID by the server's
// rule; Team Building remembers the squad it had open.

const importMock = vi.hoisted(() => ({ importFplTeam: vi.fn() }));
vi.mock("../state/fplTeamImport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/fplTeamImport")>()),
  importFplTeam: importMock.importFplTeam,
}));

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    chips: [],
    liveDataVersion: { count: 1, forced: false },
    players: [],
    teams: [],
    teamsById: new Map(),
    fixtures: [],
    events: [],
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

const SQUADS_KEY = "fpl-dashboard:saved-squads:v1";
const ACTIVE_KEY = "fpl-dashboard:saved-squads:active:v1";
const savedSquads = (): SavedSquad[] => JSON.parse(localStorage.getItem(SQUADS_KEY) ?? '{"data":[]}').data;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
}

function deferredImport() {
  let resolve!: (v: { squad: SavedSquad; warnings: string[] }) => void;
  importMock.importFplTeam.mockImplementation(() => new Promise((r) => (resolve = r)));
  return (name: string) => act(async () => resolve({ squad: createBlankSquad(name), warnings: [] }));
}

function openDialog(utils: ReturnType<typeof renderPage>) {
  fireEvent.click(utils.getByRole("button", { name: "New Squad" }));
  return {
    name: utils.container.querySelector<HTMLInputElement>("#new-squad-name")!,
    teamId: utils.container.querySelector<HTMLInputElement>("#new-squad-team-id")!,
  };
}

function createBlank(utils: ReturnType<typeof renderPage>, name: string) {
  const { name: field } = openDialog(utils);
  fireEvent.change(field, { target: { value: name } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const activeName = (utils: ReturnType<typeof renderPage>) => utils.getByLabelText("Squad name: type to rename it") as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  importMock.importFplTeam.mockReset();
});
afterEach(cleanup);

describe("Team Building New Squad dialog (audit 2026-11-03)", () => {
  it("M2: Enter pressed again while an import loads imports once", async () => {
    const finish = deferredImport();
    const utils = renderPage();
    const { teamId } = openDialog(utils);
    fireEvent.change(teamId, { target: { value: "1" } });
    for (let i = 0; i < 4; i++) fireEvent.keyDown(teamId, { key: "Enter" });
    expect(importMock.importFplTeam).toHaveBeenCalledTimes(1);
    await finish("Imported");
    expect(savedSquads().map((s) => s.name)).toEqual(["Imported"]);
  });

  it("M3: Cancel during an import drops its result; it's never saved", async () => {
    const finish = deferredImport();
    const utils = renderPage();
    const { teamId } = openDialog(utils);
    fireEvent.change(teamId, { target: { value: "1" } });
    fireEvent.keyDown(teamId, { key: "Enter" });
    fireEvent.click(utils.getByRole("button", { name: "Cancel" }));
    await finish("Imported");
    expect(savedSquads()).toEqual([]);
    expect(utils.container.querySelector("#new-squad-team-id")).toBeNull();
    // A new import afterwards still works.
    const finishAgain = deferredImport();
    const again = openDialog(utils);
    fireEvent.change(again.teamId, { target: { value: "2" } });
    fireEvent.keyDown(again.teamId, { key: "Enter" });
    await finishAgain("Second");
    expect(savedSquads().map((s) => s.name)).toEqual(["Second"]);
  });

  it("L4: the squad name is capped at 60 characters like every other name box", () => {
    const { name } = openDialog(renderPage());
    expect(name.maxLength).toBe(60);
  });

  it("L5: an over-long team ID gets 'Enter a valid FPL team ID' and is never sent", () => {
    const utils = renderPage();
    const { teamId } = openDialog(utils);
    fireEvent.change(teamId, { target: { value: "99999999999999999999" } });
    fireEvent.click(utils.getByRole("button", { name: "Load/Create" }));
    expect(importMock.importFplTeam).not.toHaveBeenCalled();
    expect(utils.container.querySelector(".banner.error")?.textContent).toContain("Enter a valid FPL team ID");
  });

  it("L5: the client's team ID check is the server's rule (plus above 0)", () => {
    for (const raw of ["1", "1234567", "99999999999", "999999999999", "99999999999999999999", "0", "000", "1.5", "1e3", "-1", " 1", "", "abc"]) {
      expect(isValidFplTeamId(raw), raw).toBe(serverIsValidTeamId(raw) && Number(raw) > 0);
    }
  });
});

describe("Team Building active squad (audit 2026-11-03 M4)", () => {
  it("reopens on the squad last open, after leaving the page or reloading", () => {
    const first = renderPage();
    createBlank(first, "Alpha");
    createBlank(first, "Bravo");
    expect(activeName(first).value).toBe("Bravo");
    first.unmount();
    expect(activeName(renderPage()).value).toBe("Bravo");
  });

  it("a remembered squad no longer saved falls back to the first squad", () => {
    const a = createBlankSquad("Alpha");
    const b = createBlankSquad("Bravo");
    localStorage.setItem(SQUADS_KEY, JSON.stringify({ version: 6, data: [a, b] }));
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ version: 1, data: "squad-deleted" }));
    expect(activeName(renderPage()).value).toBe("Alpha");
    cleanup();
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ version: 1, data: b.id }));
    expect(activeName(renderPage()).value).toBe("Bravo");
  });
});
