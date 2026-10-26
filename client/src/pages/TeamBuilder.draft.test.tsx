import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { Position } from "../types/normalized";

// <purchase_prices> as a squad changes, and <best_draft> saving what it
// picks, on the real page with the saved-squads store.

const TEAMS = [1, 2, 3, 4, 5, 6].map((id) => makeTeam({ id, shortName: `C${id}`, played: 10 }));
// A full 15 from five clubs (3 each), FPL's ep_next as their figure; id 16 is outside the squad.
const POSITIONS: Position[] = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
const EP = [2, 5, 3, 3, 3, 3, 1, 4, 4, 4, 4, 1, 6, 2, 7];
const PLAYERS = [
  ...POSITIONS.map((position, i) => makePlayer({ id: i + 1, name: `P${i + 1}`, position, teamId: Math.floor(i / 3) + 1, price: 5, minutes: 900, epNext: EP[i] })),
  makePlayer({ id: 16, name: "Newcomer", position: "MID", teamId: 6, price: 6.3, minutes: 900, epNext: 3 }),
];
// Every club plays in GW1 (FDR 3, so FPL Official is ep_next as it is).
const FIXTURES = [1, 3, 5].map((home, i) => ({ id: i + 1, eventId: 1, homeTeamId: home, awayTeamId: home + 1, homeScore: null, awayScore: null, kickoffTime: null, finished: false, started: false, homeDifficulty: 3, awayDifficulty: 3 }));

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
    seasonMatchesByPlayerId: new Map(),
    historicStatus: "ready",
    currentSeasonHasStarted: true,
    gameweekState: null,
    requestHistoricData: () => {},
  }),
}));

const STORE = "fpl-dashboard:saved-squads:v1";
const stored = () => (JSON.parse(localStorage.getItem(STORE)!) as { data: Record<string, unknown>[] }).data[0];

function save(playerIds: number[], startingXI: number[], purchasePrices: Record<number, number> = {}) {
  saveVersioned(STORE, 3, [{ id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds, startingXI, captainId: null, viceCaptainId: null, purchasePrices, usedChips: [], importedFrom: null }]);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
}

describe("Team Building — purchase prices", () => {
  it("a player added is bought at today's price; one removed takes his price with him", () => {
    save([1, 2], [2], { 1: 4.5, 2: 5 });
    const { container, getByRole } = renderBuilder();
    const row = Array.from(container.querySelectorAll("table.data-table.compact tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === "Newcomer")!;
    fireEvent.click(row.querySelector<HTMLButtonElement>("button.inline-add-btn")!);
    expect(stored().purchasePrices).toEqual({ 1: 4.5, 2: 5, 16: 6.3 });
    fireEvent.click(getByRole("button", { name: "Remove P1 from the squad" }));
    expect(stored().purchasePrices).toEqual({ 2: 5, 16: 6.3 });
  });
});

describe("Team Building — Best Draft", () => {
  it("saves the XI, captain and vice-captain with the most points for the pitch's gameweek", () => {
    // Starting 1 GKP, 4 DEF, 4 MID, 2 FWD, with the better goalkeeper (2) and forward (15) on the bench.
    save(
      POSITIONS.map((_, i) => i + 1),
      [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    );
    const { getByRole } = renderBuilder();
    fireEvent.click(getByRole("button", { name: "Best Draft" }));
    const squad = stored();
    expect([...(squad.startingXI as number[])].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 15]);
    expect(squad.captainId).toBe(15);
    expect(squad.viceCaptainId).toBe(13);
  });
});
