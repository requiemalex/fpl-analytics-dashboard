// Audit 2026-10-18 (Audit 8, saved data): how the Dashboard page moves tiles and
// graphs between its working copy (summary-tiles / graphs stores) and the saved
// views store. Asserts CORRECT behaviour per README "Saved data" and the User Guide;
// a test exposing a defect is it.fails with its finding id.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { saveVersioned } from "../state/persistentStorage";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { DEFAULT_SUMMARY_TILES, type SummaryTileConfig } from "../state/useSummaryTiles";
import { DEFAULT_DASHBOARD_GRAPHS } from "../state/useDashboardGraphs";

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
    refreshHistoricData: () => {},
    historicRefreshing: false,
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
    clubSeasons: [],
    historicReferenceSeason: null,
  }),
}));

const TILES_KEY = "fpl-dashboard:dashboard:summary-tiles:v1";
const GRAPHS_KEY = "fpl-dashboard:dashboard:graphs:v1";
const VIEWS_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const SELECTED_KEY = "fpl-dashboard:dashboard:selected-view:v1";

function tile(id: string, metricKey = "goals"): SummaryTileConfig {
  return { id, scope: "player", metricKey, direction: "desc", dataView: "lastSeason", name: id, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null };
}

const starterPlayer = { id: "default-view-player", scope: "player", name: "Starter", tiles: DEFAULT_SUMMARY_TILES.filter((t) => t.scope === "player"), graphs: DEFAULT_DASHBOARD_GRAPHS.filter((g) => g.scope === "player"), updatedAt: 0 };
const starterTeam = { id: "default-view-team", scope: "team", name: "Starter", tiles: DEFAULT_SUMMARY_TILES.filter((t) => t.scope === "team"), graphs: DEFAULT_DASHBOARD_GRAPHS.filter((g) => g.scope === "team"), updatedAt: 0 };
const myViewTeam = { id: "my-view-team", scope: "team", name: "My View", tiles: [], graphs: [], updatedAt: 0 };

function storedViews(): { id: string; tiles: { id: string }[] }[] {
  return JSON.parse(localStorage.getItem(VIEWS_KEY)!).data;
}

beforeEach(() => {
  localStorage.clear();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard saved views — working copy vs saved views (audit 2026-10-18)", () => {
  it("opening the page on a saved view loads it and does not change any saved view", () => {
    const mine = tile("mine-tile");
    const foo = tile("foo-tile", "assists");
    saveVersioned(VIEWS_KEY, 6, [
      starterPlayer,
      starterTeam,
      { id: "my-view-player", scope: "player", name: "My View", tiles: [mine], graphs: [], updatedAt: 1 },
      myViewTeam,
      { id: "view-foo", scope: "player", name: "Foo", tiles: [foo], graphs: [], updatedAt: 2 },
    ]);
    saveVersioned(SELECTED_KEY, 2, { player: "view-foo", team: "my-view-team" });
    // Working copy deliberately different from the selected view (e.g. last session's).
    saveVersioned(TILES_KEY, 6, [tile("stale-tile")]);
    saveVersioned(GRAPHS_KEY, 6, []);
    renderDashboard();
    const views = storedViews();
    expect(views.find((v) => v.id === "view-foo")!.tiles.map((t) => t.id)).toEqual(["foo-tile"]);
    expect(views.find((v) => v.id === "my-view-player")!.tiles.map((t) => t.id)).toEqual(["mine-tile"]);
    expect(JSON.parse(localStorage.getItem(TILES_KEY)!).data.map((t: { id: string }) => t.id)).toEqual(["foo-tile"]);
  });

  it("an install upgraded from views v5 while on the packaged view opens on a blank My View, and My View stays blank", () => {
    // v5 data: no My View yet; the user was on the packaged ("Default") view, whose tiles are the working copy.
    saveVersioned(VIEWS_KEY, 5, [starterPlayer, starterTeam]);
    saveVersioned(SELECTED_KEY, 1, { player: "default-view-player", team: "default-view-team" });
    saveVersioned(TILES_KEY, 6, DEFAULT_SUMMARY_TILES);
    saveVersioned(GRAPHS_KEY, 6, DEFAULT_DASHBOARD_GRAPHS);
    const { getByLabelText } = renderDashboard();
    expect((getByLabelText("Saved view") as HTMLSelectElement).value).toBe("my-view-player");
    const myView = storedViews().find((v) => v.id === "my-view-player")!;
    expect(myView.tiles).toEqual([]);
  });

  it("[AUDIT8-1] deleting the selected view doesn't overwrite My View with the deleted view's tiles", () => {
    const mine = tile("mine-tile");
    const foo = tile("foo-tile", "assists");
    saveVersioned(VIEWS_KEY, 6, [
      starterPlayer,
      starterTeam,
      { id: "my-view-player", scope: "player", name: "My View", tiles: [mine], graphs: [], updatedAt: 1 },
      myViewTeam,
      { id: "view-foo", scope: "player", name: "Foo", tiles: [foo], graphs: [], updatedAt: 2 },
    ]);
    saveVersioned(SELECTED_KEY, 2, { player: "view-foo", team: "my-view-team" });
    saveVersioned(TILES_KEY, 6, [foo]);
    saveVersioned(GRAPHS_KEY, 6, []);
    const { getByLabelText, container } = renderDashboard();

    fireEvent.click(getByLabelText("Delete View"));
    const dialog = container.querySelector(".dialog") as HTMLElement;
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    // The selection falls back to My View (README / useSavedDashboardViews.remove)...
    expect((getByLabelText("Saved view") as HTMLSelectElement).value).toBe("my-view-player");
    // ...and My View must still hold the user's own tile, not the deleted Foo's.
    const myView = storedViews().find((v) => v.id === "my-view-player")!;
    expect(myView.tiles.map((t) => t.id)).toEqual(["mine-tile"]);
  });
});
