import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { makePlayer, makeTeam } from "../test/fixtures";

// <marker_follows_data> and <hide_small_samples> on a Dashboard tile the user built (owner's rules, 2026-10-20).

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
// Six regulars and one cameo (60 minutes, under Current Season's 90-minute floor) who tops the points.
const PLAYERS = [
  makePlayer({ id: 1, name: "Cameo", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 60, totalPoints: 99 }),
  ...["Saka", "Rice", "Odegaard", "Havertz", "Saliba", "Gabriel"].map((name, i) =>
    makePlayer({ id: i + 2, name, position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, totalPoints: 60 - i }),
  ),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
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

function tile(id: string, name: string, minMinutes: number) {
  return { id, scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "live", name, criteria: { ...DEFAULT_FILTERS, minMinutes }, playerIds: null, teamIds: null };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    VIEWS_KEY,
    JSON.stringify({
      version: 6,
      data: [
        { id: "my-view-player", scope: "player", name: "My View", tiles: [tile("tile-all", "Everyone", 0), tile("tile-regulars", "Regulars", 450)], graphs: [], updatedAt: 1 },
        { id: "my-view-team", scope: "team", name: "My View", tiles: [], graphs: [], updatedAt: 1 },
      ],
    }),
  );
  localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 2, data: { player: "my-view-player", team: "my-view-team" } }));
});

afterEach(cleanup);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

function card(container: HTMLElement, title: string): HTMLElement {
  return Array.from(container.querySelectorAll<HTMLElement>(".card")).find((c) => c.querySelector(".card-title")?.textContent === title)!;
}

describe("Dashboard tiles — the stopwatch follows what's shown, and Hide leaves small samples out", () => {
  it("a tile whose Min Minutes leaves only regulars has a grey stopwatch and no Hide button", () => {
    const { container } = renderDashboard();
    const regulars = card(container, "Regulars");
    const badge = regulars.querySelector(".minutes-floor-badge")!;
    expect(badge.classList.contains("small-sample-badge")).toBe(false);
    expect(within(regulars).queryByRole("button", { name: /^Hide the/ })).toBeNull();
  });

  it("a tile showing a cameo offers Hide; on, the cameo goes and the next player fills the top 5, and it stays on after a reload", () => {
    const { container } = renderDashboard();
    const everyone = () => card(container, "Everyone");
    expect(everyone().textContent).toContain("Cameo");
    fireEvent.click(within(everyone()).getByRole("button", { name: "Hide the 1 player under the 90-minute floor (marked with the amber stopwatch)" }));
    expect(everyone().textContent).not.toContain("Cameo");
    // The five regulars with the most points, Havertz (57) the fifth.
    expect(everyone().querySelectorAll(".stat-row")).toHaveLength(5);
    expect(everyone().textContent).toContain("Havertz");
    cleanup();
    const again = renderDashboard();
    expect(card(again.container, "Everyone").textContent).not.toContain("Cameo");
  });
});
