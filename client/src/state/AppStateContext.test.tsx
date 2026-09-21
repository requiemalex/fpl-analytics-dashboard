import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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
