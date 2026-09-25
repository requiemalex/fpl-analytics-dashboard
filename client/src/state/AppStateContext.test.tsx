import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { AppStateProvider, useAppState } from "./AppStateContext";
import { makeRawElement, makeRawTeam, RAW_ELEMENT_TYPES } from "../test/rawFixtures";

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
