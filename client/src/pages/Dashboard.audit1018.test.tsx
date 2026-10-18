import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: [],
    teams: [],
    gameweekState: null,
    events: [],
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicFetchSkippedPlayerIds: [],
    refreshHistoricData: () => {},
    historicRefreshing: false,
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
    clubSeasons: [],
    historicReferenceSeason: "2025/26",
  }),
}));

const VIEWS_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const SELECTED_KEY = "fpl-dashboard:dashboard:selected-view:v1";

function tile(id: string, name: string) {
  return { id, scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "live", name, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    VIEWS_KEY,
    JSON.stringify({
      version: 6,
      data: [
        { id: "my-view-player", scope: "player", name: "My View", tiles: [tile("tile-a", "Mine A")], graphs: [], updatedAt: 1 },
        { id: "my-view-team", scope: "team", name: "My View", tiles: [], graphs: [], updatedAt: 1 },
        { id: "view-b", scope: "player", name: "B", tiles: [tile("tile-b", "B tile")], graphs: [], updatedAt: 2 },
      ],
    }),
  );
  localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 2, data: { player: "view-b", team: "my-view-team" } }));
});

afterEach(cleanup);

describe("audit 2026-10-18: deleting a Dashboard view", () => {
  // README Dashboard notes: deleting the selected view falls back to My View; it must not change My View.
  it("[PAGES-DELETE-VIEW] deleting view B leaves My View's own tiles intact (not overwritten with B's)", () => {
    const { getByLabelText, getByRole, queryByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(queryByText("B tile")).not.toBeNull();
    fireEvent.click(getByLabelText("Delete View"));
    fireEvent.click(getByRole("button", { name: "Delete" }));
    const stored = JSON.parse(localStorage.getItem(VIEWS_KEY)!).data as { id: string; tiles: { name: string }[] }[];
    const myView = stored.find((v) => v.id === "my-view-player")!;
    expect(myView.tiles.map((t) => t.name)).toEqual(["Mine A"]);
  });
});
