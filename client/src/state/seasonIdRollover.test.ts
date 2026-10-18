import { beforeEach, describe, expect, it } from "vitest";
import { ID_STORE_KEYS, liveSeasonName, rolloverSavedIds } from "./seasonIdRollover";

// Real renumbering seen between 2025/26 and 2026/27 (audit 2026-10-18 M6):
// Haaland (code 223094) was id 430 and is 411; id 430 is now Mount (code 184029).
// Salah (code 118748) was id 381; id 381 is now Koumas (code 514514).
// Man Utd (code 1) was team id 14; team id 14 is now Liverpool (code 14).
const OLD = {
  players: [
    { id: 430, code: 223094 }, // Haaland
    { id: 381, code: 118748 }, // Salah
    { id: 12, code: 999001 }, // a player who leaves FPL
  ],
  teams: [
    { id: 14, code: 1 }, // Man Utd
    { id: 12, code: 14 }, // Liverpool
    { id: 9, code: 54 }, // a club relegated out of FPL
  ],
};
const NEW = {
  players: [
    { id: 411, code: 223094 }, // Haaland
    { id: 430, code: 184029 }, // Mount
    { id: 380, code: 118748 }, // Salah
    { id: 381, code: 514514 }, // Koumas
  ],
  teams: [
    { id: 13, code: 1 }, // Man Utd
    { id: 14, code: 14 }, // Liverpool
  ],
};

const stored = (key: string) => JSON.parse(localStorage.getItem(key)!) as { version: number; data: unknown };
const tile = (o: Record<string, unknown>) => ({ id: "t", scope: "player", metricKey: "goals", direction: "desc", dataView: "live", name: null, criteria: { teamId: "ALL" }, playerIds: null, teamIds: null, ...o });

beforeEach(() => {
  localStorage.clear();
  // Ids saved during 2026/27's numbering's predecessor, 2025/26.
  rolloverSavedIds("2025/26", OLD.players, OLD.teams);
  localStorage.setItem(ID_STORE_KEYS.summaryTiles, JSON.stringify({ version: 6, data: [tile({ playerIds: [430, 381, 12] }), tile({ id: "t2", name: "Liverpool", criteria: { teamId: 12 } }), tile({ id: "t3", name: null, criteria: { teamId: 9 } })] }));
  localStorage.setItem(ID_STORE_KEYS.dashboardGraphs, JSON.stringify({ version: 5, data: [{ id: "g", scope: "team", teamIds: [14, 9], playerIds: null, criteria: null }] }));
  localStorage.setItem(ID_STORE_KEYS.savedViews, JSON.stringify({ version: 6, data: [{ id: "v", scope: "player", name: "Mine", tiles: [tile({ playerIds: [381] })], graphs: [], updatedAt: 1 }] }));
  localStorage.setItem(
    ID_STORE_KEYS.savedSquads,
    JSON.stringify({ version: 1, data: [{ id: "s1", name: "Sq", playerIds: [430, 381, 12], startingXI: [430, 12], captainId: 12, viceCaptainId: 430, usedChips: [], importedFrom: null }] }),
  );
});

describe("saved ids across FPL's summer renumbering (audit 2026-10-18 M6)", () => {
  it("within a season nothing is rewritten", () => {
    const before = localStorage.getItem(ID_STORE_KEYS.savedSquads);
    expect(rolloverSavedIds("2025/26", OLD.players, OLD.teams).rolledOver).toBe(false);
    expect(localStorage.getItem(ID_STORE_KEYS.savedSquads)).toBe(before);
  });

  it("a new season translates every saved id through FPL's permanent code, in every store, keeping each store's version", () => {
    const r = rolloverSavedIds("2026/27", NEW.players, NEW.teams);
    expect(r).toMatchObject({ rolledOver: true, fromSeason: "2025/26" });

    const tiles = stored(ID_STORE_KEYS.summaryTiles);
    expect(tiles.version).toBe(6);
    const [t1, t2, t3] = tiles.data as { playerIds: number[] | null; criteria: { teamId: number | string }; name: string | null }[];
    expect(t1.playerIds).toEqual([411, 380]); // Haaland, Salah: not Mount and Koumas, who now hold 430 and 381
    expect(t2.criteria.teamId).toBe(14); // Liverpool
    expect(t3.criteria.teamId).toBe("ALL"); // relegated club: all clubs, and the name says why
    expect(t3.name).toBe("Tile (club no longer in FPL)");

    expect((stored(ID_STORE_KEYS.dashboardGraphs).data as { teamIds: number[] }[])[0].teamIds).toEqual([13]); // Man Utd
    expect((stored(ID_STORE_KEYS.savedViews).data as { tiles: { playerIds: number[] }[] }[])[0].tiles[0].playerIds).toEqual([380]);

    const squad = (stored(ID_STORE_KEYS.savedSquads).data as Record<string, unknown>[])[0];
    expect(squad).toMatchObject({ playerIds: [411, 380], startingXI: [411], captainId: null, viceCaptainId: 411 });
  });

  it("a tracked list whose players or clubs have all left stays empty and says so, rather than turning into the whole league (audit 2026-10-18 R2)", () => {
    localStorage.setItem(
      ID_STORE_KEYS.summaryTiles,
      JSON.stringify({ version: 6, data: [tile({ name: "Leavers", playerIds: [12] }), tile({ id: "t2", name: "Mixed", playerIds: [12, 430] })] }),
    );
    localStorage.setItem(ID_STORE_KEYS.dashboardGraphs, JSON.stringify({ version: 6, data: [{ id: "g", scope: "team", name: "Promoted", teamIds: [9], playerIds: null, criteria: null }] }));
    rolloverSavedIds("2026/27", NEW.players, NEW.teams);

    const [leavers, mixed] = stored(ID_STORE_KEYS.summaryTiles).data as { name: string; playerIds: number[] }[];
    expect(leavers).toMatchObject({ name: "Leavers (players no longer in FPL)", playerIds: [] });
    expect(mixed).toMatchObject({ name: "Mixed", playerIds: [411] }); // someone left: no rename
    expect((stored(ID_STORE_KEYS.dashboardGraphs).data as Record<string, unknown>[])[0]).toMatchObject({ name: "Promoted (clubs no longer in FPL)", teamIds: [] });
  });

  it("runs once: the next load in the new season leaves the translated ids alone", () => {
    rolloverSavedIds("2026/27", NEW.players, NEW.teams);
    const after = localStorage.getItem(ID_STORE_KEYS.savedSquads);
    expect(rolloverSavedIds("2026/27", NEW.players, NEW.teams).rolledOver).toBe(false);
    expect(localStorage.getItem(ID_STORE_KEYS.savedSquads)).toBe(after);
  });

  it("the season name comes from gameweek 1's deadline", () => {
    expect(liveSeasonName([{ id: 1, deadline_time: "2026-08-14T17:30:00Z" }])).toBe("2026/27");
    expect(liveSeasonName([])).toBeNull();
  });
});
