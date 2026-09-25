import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerDetailOverlay } from "./PlayerDetailOverlay";
import { makePlayer, makeTeam } from "../test/fixtures";
import { useEscapeLayer } from "../state/useEscapeLayer";

// Audit 2026-09-25 (Player Explorer), 3-regression.md R6: the profile's
// Escape had no test. Also R10: it must close only itself.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
const PLAYERS = [makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 40, minutes: 450 })];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    historicReferenceSeason: "2025/26",
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    historicProfiles: new Map(),
    allTimeSeasonsByPlayerId: new Map(),
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

vi.mock("../state/usePlayerHistory", () => ({
  usePlayerHistory: () => ({ status: "loading", history: [], seasonHistory: [], errorMessage: null, retry: () => {} }),
}));

beforeAll(() => {
  // Charts measure their box; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

/** Something opened before the profile (a column filter under it) — records whether Escape reached it. */
function EarlierLayer({ onEscape }: { onEscape: () => void }) {
  useEscapeLayer(true, onEscape);
  return null;
}

describe("PlayerDetailOverlay — Escape", () => {
  it("R6: Escape closes the profile (removes ?player= from the address)", () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(getByTestId("location-search").textContent).toBe("?player=1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getByTestId("location-search").textContent).toBe("");
  });

  it("R10: with something already open underneath, Escape closes the profile only", () => {
    const underneath = vi.fn();
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <EarlierLayer onEscape={underneath} />
        <PlayerDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getByTestId("location-search").textContent).toBe("");
    expect(underneath).not.toHaveBeenCalled();
  });
});
