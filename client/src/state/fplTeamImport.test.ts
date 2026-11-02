import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { describeImportedSquadUpdate, resetImportedSquadSync, syncImportedSquads, takeImportedSquadUpdates } from "./fplTeamImport";
import { loadSavedSquads, useSavedSquads } from "./useSavedSquads";
import { makePlayer } from "../test/fixtures";
import type { SavedSquad } from "../types/team";

// <imported_squad_sync>: a squad loaded from an FPL team ID catches up with
// the team once FPL shows a later gameweek's picks.

const fetchEntryTeamMock = vi.fn();
const fetchEntryHistoryMock = vi.fn();
const fetchEntryPicksMock = vi.fn();
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchEntryTeam: (...args: unknown[]) => fetchEntryTeamMock(...args),
  fetchEntryHistory: (...args: unknown[]) => fetchEntryHistoryMock(...args),
  fetchEntryPicks: (...args: unknown[]) => fetchEntryPicksMock(...args),
}));
vi.mock("./importedPurchasePrices", () => ({
  loadImportedPurchasePrices: vi.fn(async (_teamId: number, _eventId: number, _players: unknown) => ({ playerIds: [], purchasePrices: { 16: 6.3 } })),
}));

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";
const GW8_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const GW9_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
const players = new Map(
  [...GW8_IDS, 16].map((id) => [id, makePlayer({ id, position: id <= 2 ? "GKP" : "MID", name: id === 15 ? "Rice" : id === 16 ? "Saka" : `P${id}` })]),
);

function importedSquad(asOfEvent: number): SavedSquad {
  return {
    id: "squad-1",
    name: "My renamed squad",
    createdAt: 1,
    updatedAt: 1,
    playerIds: GW8_IDS,
    startingXI: GW8_IDS.slice(0, 11),
    captainId: 3,
    viceCaptainId: 4,
    purchasePrices: { 15: 6 },
    usedChips: [],
    importedFrom: { teamId: 77, teamName: "Eze Peasy", managerName: "A Manager", asOfEvent, bank: 1.1, budget: 103.8, playerIds: GW8_IDS, purchasePrices: { 15: 6 } },
  };
}

function seed(squads: SavedSquad[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: squads }));
}

function fplShows(currentEvent: number) {
  fetchEntryTeamMock.mockResolvedValue({ data: { id: 77, name: "Eze Peasy", player_first_name: "A", player_last_name: "Manager", current_event: currentEvent, started_event: 1 } });
  fetchEntryHistoryMock.mockResolvedValue({ data: { current: [{ event: currentEvent, bank: 8 }], chips: [] } });
  fetchEntryPicksMock.mockResolvedValue({
    data: { picks: GW9_IDS.map((element, i) => ({ element, position: i + 1, multiplier: i < 11 ? 1 : 0, is_captain: element === 5, is_vice_captain: element === 3 })) },
  });
}

beforeEach(() => {
  localStorage.clear();
  resetImportedSquadSync();
  vi.clearAllMocks();
});

describe("imported squad sync (<imported_squad_sync>)", () => {
  it("a squad imported in an earlier gameweek takes FPL's latest picks, keeping its own name", async () => {
    seed([importedSquad(8)]);
    fplShows(9);
    const updates = await syncImportedSquads(9, players);
    const [squad] = loadSavedSquads();
    expect(squad.id).toBe("squad-1");
    expect(squad.name).toBe("My renamed squad");
    expect(squad.playerIds).toEqual(GW9_IDS);
    expect(squad.captainId).toBe(5);
    expect(squad.importedFrom).toMatchObject({ teamId: 77, asOfEvent: 9, bank: 0.8, playerIds: GW9_IDS, purchasePrices: { 16: 6.3 } });
    expect(updates).toEqual([{ squadName: "My renamed squad", event: 9, playersIn: [16], playersOut: [15] }]);
    expect(describeImportedSquadUpdate(updates[0], players)).toBe("My renamed squad now shows FPL's Gameweek 9 team: Saka in, Rice out.");
    expect(takeImportedSquadUpdates()).toEqual(updates);
    expect(takeImportedSquadUpdates()).toEqual([]);
  });

  it("a squad already on the current gameweek isn't asked about: FPL hides the next gameweek's picks until its deadline", async () => {
    seed([importedSquad(9)]);
    expect(await syncImportedSquads(9, players)).toEqual([]);
    expect(fetchEntryTeamMock).not.toHaveBeenCalled();
  });

  it("a squad built from scratch is left alone", async () => {
    seed([{ ...importedSquad(8), importedFrom: null }]);
    await syncImportedSquads(9, players);
    expect(fetchEntryTeamMock).not.toHaveBeenCalled();
  });

  it("while FPL still shows the imported gameweek nothing changes, and it isn't asked again until the next gameweek", async () => {
    seed([importedSquad(8)]);
    fplShows(8);
    expect(await syncImportedSquads(9, players)).toEqual([]);
    expect(loadSavedSquads()[0].playerIds).toEqual(GW8_IDS);
    await syncImportedSquads(9, players);
    expect(fetchEntryTeamMock).toHaveBeenCalledTimes(1);
    fplShows(10);
    await syncImportedSquads(10, players);
    expect(loadSavedSquads()[0].importedFrom?.asOfEvent).toBe(10);
  });

  it("a failed request leaves the squad as it was and is tried again on the next load", async () => {
    seed([importedSquad(8)]);
    fetchEntryTeamMock.mockRejectedValueOnce(new Error("offline"));
    expect(await syncImportedSquads(9, players)).toEqual([]);
    expect(loadSavedSquads()[0].playerIds).toEqual(GW8_IDS);
    fplShows(9);
    await syncImportedSquads(9, players);
    expect(loadSavedSquads()[0].playerIds).toEqual(GW9_IDS);
  });

  it("with Team Building open, the change goes through its own state, so the page shows it at once", async () => {
    seed([importedSquad(8)]);
    fplShows(9);
    const { result } = renderHook(() => useSavedSquads());
    await syncImportedSquads(9, players);
    await waitFor(() => expect(result.current.squads[0].playerIds).toEqual(GW9_IDS));
    expect(loadSavedSquads()[0].playerIds).toEqual(GW9_IDS);
  });

  it("names a wildcard's worth of changes by count", () => {
    expect(describeImportedSquadUpdate({ squadName: "S", event: 9, playersIn: [1, 2, 3, 4], playersOut: [5, 6, 7, 8] }, players)).toBe("S now shows FPL's Gameweek 9 team: 4 players changed.");
  });
});
