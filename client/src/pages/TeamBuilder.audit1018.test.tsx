import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { Position } from "../types/normalized";

const KEY = "fpl-dashboard:saved-squads:v1";
const TEAMS = Array.from({ length: 20 }, (_, i) => makeTeam({ id: i + 1 }));
// 1 GKP, 4 DEF, 3 MID, 2 FWD starters (ids 1-10) and a MID on the bench (id 11), each at its own club.
const POS: Position[] = ["GKP", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "MID"];
const PLAYERS = POS.map((position, i) => makePlayer({ id: i + 1, name: `P${i + 1}`, position, teamId: i + 1 }));

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
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

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
}

describe("Team Building — saved squads (Audit 8)", () => {
  it("[TB-3] a corrupted saved squad (no playerIds) degrades with a fallback instead of crashing the page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveVersioned(KEY, 1, [{ id: "s1", name: "Broken" }]);
    expect(() => renderBuilder()).not.toThrow();
  });

  it("[TB-5] a starter no longer in FPL doesn't stop an 11th visible player from starting", () => {
    saveVersioned(KEY, 1, [
      {
        id: "s1",
        name: "Ghost",
        createdAt: 0,
        updatedAt: 0,
        playerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9999, 11],
        startingXI: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9999],
        captainId: null,
        viceCaptainId: null,
        usedChips: [],
        importedFrom: null,
      },
    ]);
    const { container } = renderBuilder();
    expect(container.querySelectorAll(".pitch .pitch-card")).toHaveLength(10);
    fireEvent.drop(container.querySelector(".pitch")!, { dataTransfer: { getData: () => "11" } });
    expect(container.querySelectorAll(".pitch .pitch-card")).toHaveLength(11);
  });
});

describe("Team Building — saved ids FPL no longer lists (Phase 2, M8/M9)", () => {
  it("[TB-5] flags the missing player and removes it from squad, XI and armband in one click", () => {
    saveVersioned(KEY, 1, [
      {
        id: "s1",
        name: "Ghost",
        createdAt: 0,
        updatedAt: 0,
        playerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9999, 11],
        startingXI: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9999],
        captainId: 9999,
        viceCaptainId: 1,
        usedChips: [],
        importedFrom: null,
      },
    ]);
    const { getByLabelText, getByText } = renderBuilder();
    expect(getByText(/no longer in FPL's player list/).textContent).toContain("9999");
    fireEvent.click(getByLabelText("Remove players no longer in FPL from this squad"));
    const stored = JSON.parse(localStorage.getItem(KEY)!).data[0];
    expect(stored.playerIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(stored.startingXI).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stored.captainId).toBeNull();
    expect(stored.viceCaptainId).toBe(1);
  });

  it("[TB-3] repairs a damaged squad: non-number ids dropped, XI and armbands kept within the squad, an entry with no id skipped", () => {
    saveVersioned(KEY, 1, [
      { id: "s1", name: "Damaged", playerIds: [1, "2", null, 3, 3], startingXI: [1, 3, 4], captainId: 4, viceCaptainId: 3 },
      { name: "No id" },
      null,
    ]);
    renderBuilder();
    const stored = JSON.parse(localStorage.getItem(KEY)!).data;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "s1", playerIds: [1, 3], startingXI: [1, 3], captainId: null, viceCaptainId: 3, usedChips: [], importedFrom: null });
  });
});
