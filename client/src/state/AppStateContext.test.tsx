import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { AppStateProvider, useAppState } from "./AppStateContext";
import { makeRawElement, makeRawTeam, RAW_ELEMENT_TYPES } from "../test/rawFixtures";
import { finishedGameweeks, setFinishedGameweeks } from "./seasonProgress";
import { fixedFloorMinutes } from "../metrics/fixedMinutesFloor";

const fetchBootstrapMock = vi.fn();
const fetchFixturesMock = vi.fn();
const fetchHistoricBulkMock = vi.fn();

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    fetchBootstrap: (...args: unknown[]) => fetchBootstrapMock(...args),
    fetchFixtures: (...args: unknown[]) => fetchFixturesMock(...args),
    fetchHistoricBulk: (...args: unknown[]) => fetchHistoricBulkMock(...args),
  };
});

function bootstrapPayload() {
  return {
    data: {
      elements: [makeRawElement({ id: 1 })],
      teams: [makeRawTeam({ id: 1 })],
      element_types: RAW_ELEMENT_TYPES,
      events: [],
      element_stats: [],
      total_players: 100,
    },
    source: "live" as const,
    fetchedAt: Date.now(),
    skippedElementCount: 0,
  };
}

beforeEach(() => {
  fetchBootstrapMock.mockReset();
  fetchFixturesMock.mockReset();
  fetchHistoricBulkMock.mockReset();
  fetchHistoricBulkMock.mockResolvedValue({ data: { players: [], totalPlayers: 0, skippedPlayerIds: [] }, source: "live", fetchedAt: Date.now() });
});

describe("AppStateProvider — L8 regression: bootstrap-static and fixtures must be requested concurrently, not sequentially", () => {
  it("calls fetchFixtures before fetchBootstrap's own promise has resolved (i.e. they're in flight together, not one-after-the-other)", async () => {
    let resolveBootstrap!: (v: unknown) => void;
    fetchBootstrapMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    fetchFixturesMock.mockResolvedValue({ data: [], source: "live", fetchedAt: Date.now() });

    renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });

    // If fetches were sequential (fixtures only started after bootstrap
    // resolved), fetchFixturesMock would NOT have been called yet here,
    // since bootstrap is deliberately left unresolved.
    await waitFor(() => expect(fetchFixturesMock).toHaveBeenCalledTimes(1));
    expect(fetchBootstrapMock).toHaveBeenCalledTimes(1);

    resolveBootstrap(bootstrapPayload());
  });
});

// Audit 2026-09-25 player-team-profiles, second remediation pass (3-regression.md).
describe("AppStateProvider — R3: a failed fixtures request doesn't make a season in progress look unstarted", () => {
  it("currentSeasonHasStarted comes from a finished gameweek when fixtures fail", async () => {
    const payload = bootstrapPayload();
    payload.data.events = [
      { id: 1, name: "Gameweek 1", deadline_time: "2026-08-21T17:30:00Z", finished: true, is_previous: true, is_current: false, is_next: false },
      { id: 2, name: "Gameweek 2", deadline_time: "2026-08-28T17:30:00Z", finished: false, is_previous: false, is_current: true, is_next: false },
    ] as never[];
    fetchBootstrapMock.mockResolvedValue(payload);
    fetchFixturesMock.mockRejectedValue(new Error("502"));
    const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(fetchFixturesMock).toHaveBeenCalled());
    expect(result.current.fixtures).toEqual([]);
    expect(result.current.currentSeasonHasStarted).toBe(true);
  });
});

describe("AppStateProvider — Current Season's minutes floor follows the gameweeks finished (<fixed_minutes_floor>)", () => {
  it("counts FPL's finished gameweeks on load, so the floor is a quarter of their minutes", async () => {
    const payload = bootstrapPayload();
    payload.data.events = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Gameweek ${i + 1}`,
      deadline_time: `2026-08-${String(15 + i).padStart(2, "0")}T17:30:00Z`,
      finished: i < 9,
      is_previous: i === 8,
      is_current: i === 9,
      is_next: false,
    })) as never[];
    fetchBootstrapMock.mockResolvedValue(payload);
    fetchFixturesMock.mockResolvedValue({ data: [], source: "live", fetchedAt: Date.now() });
    const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(finishedGameweeks()).toBe(9);
    expect(fixedFloorMinutes("live")).toBe(203);
    setFinishedGameweeks(0);
  });
});

describe("AppStateProvider — R2: Refresh Data also refreshes the historic dataset, once something has loaded it", () => {
  beforeEach(() => {
    fetchBootstrapMock.mockResolvedValue(bootstrapPayload());
    fetchFixturesMock.mockResolvedValue({ data: [], source: "live", fetchedAt: Date.now() });
  });

  it("rebuilds it (forced) when it was loaded this session", async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.requestHistoricData());
    await waitFor(() => expect(result.current.historicStatus).toBe("ready"));
    expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(1);
    await act(() => result.current.refresh());
    await waitFor(() => expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(2));
    expect(fetchHistoricBulkMock).toHaveBeenLastCalledWith({ forceRefresh: true });
  });

  it("doesn't start it when nothing has needed it", async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.refresh());
    expect(fetchHistoricBulkMock).not.toHaveBeenCalled();
  });
});

describe("AppStateProvider — the historic dataset rebuilds itself after newly finished matches", () => {
  const fixture = (id: number, finished: boolean) => ({
    id,
    event: 1,
    team_h: 1,
    team_a: 1,
    team_h_score: finished ? 1 : null,
    team_a_score: finished ? 0 : null,
    kickoff_time: "2026-10-18T14:00:00Z",
    finished,
    started: finished,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
  });
  let finishedCount = 1;
  const POLL = 10 * 60 * 1000;

  beforeEach(() => {
    finishedCount = 1;
    fetchBootstrapMock.mockImplementation(async () => bootstrapPayload());
    fetchFixturesMock.mockImplementation(async () => ({ data: [1, 2, 3, 4, 5].map((id) => fixture(id, id <= finishedCount)), source: "live", fetchedAt: Date.now() }));
  });

  async function poll(result: { current: ReturnType<typeof useAppState> }, version: number) {
    await act(async () => {
      vi.advanceTimersByTime(POLL);
    });
    await waitFor(() => expect(result.current.liveDataVersion.count).toBe(version));
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("rebuilds (forced) when the poll finds more finished matches, at most hourly, and not for the same count", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-18T17:00:00Z"));
    try {
      const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
      await waitFor(() => expect(result.current.fixtures).toHaveLength(5));
      act(() => result.current.requestHistoricData());
      await waitFor(() => expect(result.current.historicStatus).toBe("ready"));
      expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(1);

      // Same finished count: nothing.
      await poll(result, 2);
      expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(1);

      // A match confirmed finished: rebuilt, forced.
      finishedCount = 2;
      await poll(result, 3);
      await waitFor(() => expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(2));
      expect(fetchHistoricBulkMock).toHaveBeenLastCalledWith({ forceRefresh: true });

      // Another, 10 minutes later: within the hour, so it waits…
      finishedCount = 3;
      await poll(result, 4);
      expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(2);
      // …and goes on the first poll an hour after the last rebuild.
      for (let v = 5; v <= 8; v++) await poll(result, v);
      expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(2);
      await poll(result, 9);
      await waitFor(() => expect(fetchHistoricBulkMock).toHaveBeenCalledTimes(3));
    } finally {
      vi.useRealTimers();
    }
  });

  it("never starts the historic dataset by itself when nothing has asked for it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
      await waitFor(() => expect(result.current.fixtures).toHaveLength(5));
      finishedCount = 4;
      await poll(result, 2);
      expect(fetchHistoricBulkMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts each successful load in liveDataVersion, marking Refresh Data as forced", async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: ({ children }) => <AppStateProvider>{children}</AppStateProvider> });
    await waitFor(() => expect(result.current.liveDataVersion).toEqual({ count: 1, forced: false }));
    await act(() => result.current.refresh());
    expect(result.current.liveDataVersion).toEqual({ count: 2, forced: true });
  });
});
