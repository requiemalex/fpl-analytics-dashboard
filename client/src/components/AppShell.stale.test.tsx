import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { isStale: false, staleDatasets: { fixtures: false, historic: false } };
vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    status: "ready",
    lastUpdated: Date.now(),
    refreshing: false,
    refresh: () => {},
    players: [],
    errorMessage: null,
    gameweekState: null,
    events: [],
    ...state,
  }),
}));

const { AppShell } = await import("./AppShell");

afterEach(() => {
  cleanup();
  state.isStale = false;
  state.staleDatasets = { fixtures: false, historic: false };
});

const banner = () =>
  render(
    <MemoryRouter>
      <AppShell>
        <div />
      </AppShell>
    </MemoryRouter>,
  ).container.querySelector(".banner.stale")?.textContent ?? null;

describe("stale fixtures or historic data are flagged, never shown as current (audit 2026-10-18 M3)", () => {
  it("no banner when everything is live", () => {
    expect(banner()).toBeNull();
  });
  it("names the datasets served from a cached copy", () => {
    state.staleDatasets = { fixtures: true, historic: true };
    expect(banner()).toContain("cached copy of the fixtures and historic data");
  });
});
