import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard, resolvePlayerGraphColumn, resolveTeamTileMetric } from "../pages/Dashboard";
import { PlayerComparison } from "../pages/PlayerComparison";
import { ExternalStatsContext, type ExternalStatsSource } from "../extensions/externalStats";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { makePlayer, makeSeason, makeTeam } from "../test/fixtures";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import { createProfiles } from "./profiles";
import { understatTrends } from "./trends";
import { UNDERSTAT_DASHBOARD_STARTER } from "./dashboardStarter";
import type { UsClubResolved, UsPlayerResolved } from "./resolve";
import type { UsClubTotals, UsPlayerTotals } from "./schema";

// Understat on the Dashboard and in Player Comparison, the Explorers' way
// (<same_toggle_everywhere>): Understat's own figures in their own picker
// groups (<external_metric_key>), and a ⇄ toggle on the figures both sources
// have, starting on FPL each visit — each figure one source end to end
// (<one_source_per_figure>).

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 50, goals: 4, xG: 3.21, minutes: 900 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 40, goals: 2, xG: 1.11, minutes: 900 }),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    gameweekState: null,
    events: [],
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicFetchSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
    clubSeasons: [],
    historicReferenceSeason: "2025/26",
    allTimeSeasonsByPlayerId: new Map([[1, [makeSeason({ seasonName: "2025/26", totalPoints: 150, minutes: 2400 })]]]),
  }),
}));

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
const usTotals: UsPlayerTotals = {
  understatId: "u1", appearances: 10, minutes: 880, goals: 3, assists: 2, shots: 25, shotsOnTarget: 10, keyPasses: 15, xG: 4.56, xA: 2, npxG: 4.56, npGoals: 3,
  xGChain: 6, xGBuildup: 1, situations: { OpenPlay: slice(20, 3, 4), FromCorner: slice(5, 0, 0.56), SetPiece: slice(), DirectFreekick: slice(), Penalty: slice() },
  bodyParts: { RightFoot: slice(20, 2, 3.5), LeftFoot: slice(3, 1, 0.8), Head: slice(2, 0, 0.26), OtherBodyPart: slice() },
  shotDetail: { woodwork: 1, blocked: 6, assisted: 12, lastActions: { Cross: slice(3, 0, 0.3), Throughball: slice(2, 1, 0.6), TakeOn: slice(1, 0, 0.1), Rebound: slice() } },
  shotsComplete: true,
};
const resolved: UsPlayerResolved = { totals: usTotals, seasons: 1 };

function fakeSource(overrides: Partial<ExternalStatsSource> = {}): ExternalStatsSource {
  return {
    id: "understat",
    label: "Understat",
    className: "col-source-understat",
    icon: null,
    status: "ready",
    staleNote: null,
    request: () => {},
    // Only Saka is linked; Rice has no Understat figures ("—").
    playerColumns: () => understatPlayerColumns((p) => (p.id === 1 ? resolved : null)),
    teamColumns: () => understatTeamColumns(new Map(TEAMS.map((t) => [t.id, t])), () => null),
    playerTrends: understatTrends(null),
    dashboardStarter: { tiles: [], graphs: [] },
    explorerDefaults: { player: [], team: [] },
    profiles: createProfiles(new Map(), { player: () => {}, club: () => {} }),
    guideSection: { id: "understat", navLabel: "Understat stats", title: "Understat stats", accentVar: "--col-understat", body: null },
    ...overrides,
  };
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

// ---------- Dashboard ----------

function tile(id: string, name: string, metricKey: string) {
  return { id, scope: "player", metricKey, direction: "desc", dataView: "live", name, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null };
}

function storeDashboard(tiles: unknown[]) {
  localStorage.setItem(
    "fpl-dashboard:dashboard:saved-views:v1",
    JSON.stringify({
      version: 7,
      data: [
        { id: "my-view-player", scope: "player", name: "My View", tiles, graphs: [], updatedAt: 1 },
        { id: "my-view-team", scope: "team", name: "My View", tiles: [], graphs: [], updatedAt: 1 },
      ],
    }),
  );
  localStorage.setItem("fpl-dashboard:dashboard:selected-view:v1", JSON.stringify({ version: 2, data: { player: "my-view-player", team: "my-view-team" } }));
}

function renderDashboard(source: ExternalStatsSource | null) {
  return render(
    <ExternalStatsContext.Provider value={source}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </ExternalStatsContext.Provider>,
  );
}

function tileCard(container: HTMLElement, title: string): HTMLElement {
  return [...container.querySelectorAll<HTMLElement>(".card")].find((c) => c.querySelector(".card-title")?.textContent === title)!;
}

describe("Dashboard with Understat mounted", () => {
  it("a tile of an Understat figure ranks on Understat's own numbers, with the source badge", () => {
    storeDashboard([tile("t-shots", "Shots", "understat:us.shots"), tile("t-fpl", "Goals", "goals")]);
    const { container } = renderDashboard(fakeSource());

    const shots = tileCard(container, "Shots");
    // Rice has no Understat figure, so he isn't listed (never a 0).
    const names = [...shots.querySelectorAll(".stat-row-name")].map((n) => n.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("Saka");
    expect(shots.querySelector(".stat-row-value")!.textContent).toBe("25");
    expect(shots.querySelector(".source-badge.col-source-understat")!.getAttribute("title")).toBe("Understat's figures: Shots");

    // <card_source_mark>: an FPL-only figure has FPL's mark, first in the header, and no toggle.
    const fpl = tileCard(container, "Goals");
    expect(fpl.querySelector(".source-badge.col-source-fpl")!.getAttribute("title")).toBe("FPL's figures: Goals");
    expect(fpl.querySelector(".source-toggle")).toBeNull();
    const firstIcon = (card: HTMLElement) => card.querySelector(".card-title")!.nextElementSibling!.firstElementChild!;
    expect(firstIcon(fpl).querySelector(".source-badge")).toBeTruthy();
    expect(firstIcon(shots).querySelector(".source-badge.col-source-understat")).toBeTruthy();
    // Nor does Understat's own figure have a toggle: there's no FPL version to switch to.
    expect(shots.querySelector(".source-toggle")).toBeNull();
  });

  it("a figure both sources have gets the Explorers' ⇄ toggle: FPL first, the whole tile switched, FPL again next visit", () => {
    storeDashboard([tile("t-xg", "xG", "xG")]);
    const first = renderDashboard(fakeSource());
    let card = tileCard(first.container, "xG");
    const values = () => [...card.querySelectorAll(".stat-row-value")].map((v) => v.textContent);
    expect(values()).toEqual(["3.21", "1.11"]);
    expect(card.querySelector(".source-badge")).toBeNull();
    const toggle = within(card).getByRole("button", { name: "Showing FPL's xG · Click to show Understat's" });

    fireEvent.click(toggle);
    card = tileCard(first.container, "xG");
    // Understat's figures only: Saka's 4.56, Rice (no Understat figure) left out, never FPL's 3.21.
    expect(values()).toEqual(["4.56"]);
    expect(within(card).getByRole("button", { name: "Showing Understat's xG · Click to show FPL's" }).getAttribute("aria-pressed")).toBe("true");
    // The ⇄ toggle is its source mark: no separate icon beside it.
    expect(card.querySelector(".source-badge")).toBeNull();
    // Nothing about the choice is saved: the tile is stored as FPL's xG.
    expect(localStorage.getItem("fpl-dashboard:dashboard:saved-views:v1")).not.toContain("understat:");

    cleanup();
    const again = renderDashboard(fakeSource());
    card = tileCard(again.container, "xG");
    expect(values()).toEqual(["3.21", "1.11"]);
  });

  it("asks for Understat's data only once a tile or graph uses it", () => {
    const request = vi.fn();
    storeDashboard([tile("t-fpl", "FPL xG", "xG")]);
    renderDashboard(fakeSource({ request }));
    expect(request).not.toHaveBeenCalled();
    cleanup();
    storeDashboard([tile("t-shots", "Shots", "understat:us.shots")]);
    renderDashboard(fakeSource({ request }));
    expect(request).toHaveBeenCalled();
  });

  it("says so while Understat is loading, or when it couldn't be loaded", () => {
    storeDashboard([tile("t-shots", "Shots", "understat:us.shots")]);
    const loading = renderDashboard(fakeSource({ status: "loading", playerColumns: () => understatPlayerColumns(() => null) }));
    expect(tileCard(loading.container, "Shots").textContent).toContain("Loading Understat data…");
    cleanup();
    const failed = renderDashboard(fakeSource({ status: "unavailable", staleNote: "Understat data couldn't be loaded, so its columns show —.", playerColumns: () => understatPlayerColumns(() => null) }));
    const card = tileCard(failed.container, "Shots");
    expect(card.textContent).toContain("Understat data couldn't be loaded.");
    expect(card.querySelector(".source-stale-marker")).toBeTruthy();
  });

  it("with Understat switched off, its tile says why and can still be removed", () => {
    storeDashboard([tile("t-shots", "Shots", "understat:us.shots")]);
    const { container } = renderDashboard(null);
    const card = tileCard(container, "Shots");
    expect(card.textContent).toContain("This tile uses figures from a second data source that's switched off.");
    expect(within(card).getByRole("button", { name: /remove/i })).toBeTruthy();
  });

  it("the Statistic picker groups figures as the Explorers' Columns picker does, and an Understat pick starts in its natural order", () => {
    storeDashboard([]);
    const { getByRole, container } = renderDashboard(fakeSource());
    fireEvent.click(getByRole("button", { name: "Add Tile" }));
    fireEvent.click(container.querySelector("#new-tile-metric")!);
    const list = getByRole("listbox");
    const groupEls = [...list.querySelectorAll<HTMLElement>('[role="group"]')];
    const groups = groupEls.map((g) => g.getAttribute("aria-label"));
    // Every FPL underlying figure has an Understat version, so its heading would be empty and isn't shown.
    expect(groups.slice(0, 2)).toEqual(["FPL · Actual Output", "FPL · Advanced"]);
    expect(groups).not.toContain("FPL · Underlying Performance");
    expect(groups).toContain("FPL & Understat");
    expect(groups.indexOf("Understat · Shooting")).toBeGreaterThan(groups.indexOf("FPL & Understat"));
    // Headed as the Explorers' Columns picker is: the shared heading, in each source's colour.
    const headingOf = (label: string) => groupEls.find((g) => g.getAttribute("aria-label") === label)!.querySelector(".menu-group-heading")!;
    expect(headingOf("FPL · Actual Output").classList.contains("col-source-fpl")).toBe(true);
    expect(headingOf("FPL & Understat").classList.contains("col-source-crossover")).toBe(true);
    expect(headingOf("Understat · Shooting").classList.contains("col-source-understat")).toBe(true);
    expect(headingOf("FPL · Actual Output").querySelector(".menu-group-icon svg")).toBeTruthy();
    // xG is listed once, under the crossover group (switched on the tile), never as a separate Understat statistic.
    const crossover = groupEls.find((g) => g.getAttribute("aria-label") === "FPL & Understat")!;
    expect(crossover.querySelector('[data-value="xG"]')).toBeTruthy();
    expect(list.querySelectorAll('[data-value="xG"]')).toHaveLength(1);
    expect(list.querySelector('[data-value="understat:xG"]')).toBeNull();

    fireEvent.click(list.querySelector('[data-value="understat:us.blockedShots"]')!);
    expect(container.querySelector("#new-tile-metric")!.textContent).toBe("Blocked Shots");
    const dialog = container.querySelector(".dialog") as HTMLElement;
    expect(within(dialog).getByRole("radio", { name: "Lowest First" }).getAttribute("aria-checked")).toBe("true");
  });

  it("without a second source the picker is FPL's groups alone", () => {
    storeDashboard([]);
    const { getByRole, container } = renderDashboard(null);
    fireEvent.click(getByRole("button", { name: "Add Tile" }));
    fireEvent.click(container.querySelector("#new-tile-metric")!);
    const groups = [...getByRole("listbox").querySelectorAll('[role="group"]')].map((g) => g.getAttribute("aria-label")!);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.startsWith("FPL · "))).toBe(true);
  });

  it("a graph's ⇄ switches its axis to Understat's figure; unswitched it's FPL's", () => {
    const fpl = resolvePlayerGraphColumn("xG", "live", fakeSource())!;
    expect(fpl.source).toBeNull();
    expect(fpl.crossover).toBe(true);
    expect(fpl.metric.getValue(PLAYERS[0], {} as never)).toBe(3.21);
    const switched = resolvePlayerGraphColumn("xG", "live", fakeSource(), true)!;
    expect(switched.source?.id).toBe("understat");
    expect(switched.metric.getValue(PLAYERS[0], {} as never)).toBe(4.56);
    // Switched with Understat gone, it's FPL's again; a figure only FPL has has no toggle.
    expect(resolvePlayerGraphColumn("xG", "live", null, true)!.source).toBeNull();
    expect(resolvePlayerGraphColumn("totalPoints", "live", fakeSource())!.crossover).toBe(false);
    expect(resolvePlayerGraphColumn("understat:us.shots", "live", null)).toBeNull();
  });

  it("a team tile can show a club's Understat figure", () => {
    const totals = { shots: 412, shotsCompleteFor: true } as unknown as UsClubTotals;
    const club: UsClubResolved = { totals, seasons: 1 };
    const ext = fakeSource({ teamColumns: () => understatTeamColumns(new Map(TEAMS.map((t) => [t.id, t])), () => club) });
    const r = resolveTeamTileMetric("understat:us.shots", "live", ext)!;
    expect(r.metric.label).toBe("Shots");
    expect(r.metric.getValue({ teamId: 1 } as never)).toBe(412);
  });
});

describe("the Dashboard's Starter view (<source_starter_items>) and its cards' source marks (<card_source_mark>)", () => {
  function showStarter() {
    storeDashboard([]);
    localStorage.setItem("fpl-dashboard:dashboard:selected-view:v1", JSON.stringify({ version: 2, data: { player: "default-view-player", team: "my-view-team" } }));
  }
  const titles = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".card .card-title")];
  const titleOf = (container: HTMLElement, text: string) => titles(container).find((t) => t.textContent === text)!;

  it("with Understat mounted, its Starter tiles and graphs follow the FPL ones", () => {
    showStarter();
    const { container } = renderDashboard(fakeSource({ dashboardStarter: UNDERSTAT_DASHBOARD_STARTER }));
    expect(titles(container).map((t) => t.textContent)).toEqual([
      "Points",
      "Pts/£m",
      "DC/Game",
      "Bonus",
      "NPxGI/Game",
      "Shots/Game",
      "Key Passes/Game",
      "Penalties Taken",
      "NP Goals − NPxG · Lowest First",
      "xG vs Goals",
      "Price vs Points",
      "Shots/Game vs xG/Shot",
      "Price vs NPxGI/Game",
    ]);
    expect(container.textContent).not.toContain("no longer available");
    // The colour and icon say a figure is Understat's: no title spells it out (owner's decision, 2026-10-24).
    expect(container.textContent).not.toContain("(Understat)");
  });

  it("with Understat switched off, the Starter view is FPL's tiles and graphs alone, with nothing marked unavailable", () => {
    showStarter();
    const { container } = renderDashboard(null);
    expect(titles(container).map((t) => t.textContent)).toEqual(["Points", "Pts/£m", "DC/Game", "Bonus", "xG vs Goals", "Price vs Points"]);
    expect(container.textContent).not.toContain("switched off");
  });

  it("each card's title is coloured by its figures' source: FPL green, Understat violet, both rose; the hover names them", () => {
    showStarter();
    const { container } = renderDashboard(fakeSource({ dashboardStarter: UNDERSTAT_DASHBOARD_STARTER }));
    const points = titleOf(container, "Points");
    expect(points.classList.contains("col-source-fpl")).toBe(true);
    expect(points.getAttribute("title")).toBe("FPL's figures: Points");
    const shots = titleOf(container, "Shots/Game");
    expect(shots.classList.contains("col-source-understat")).toBe(true);
    expect(shots.getAttribute("title")).toBe("Understat's figures: Shots/Game");
    expect(titleOf(container, "Shots/Game vs xG/Shot").classList.contains("col-source-understat")).toBe(true);
    const mixed = titleOf(container, "Price vs NPxGI/Game");
    expect(mixed.classList.contains("col-source-crossover")).toBe(true);
    expect(mixed.getAttribute("title")).toBe("FPL's figures: Price · Understat's figures: NPxGI/Game");
    expect(titleOf(container, "Price vs Points").getAttribute("title")).toBe("FPL's figures: Price, Points");
  });

  it("a figure both sources have is marked by the source its ⇄ is showing", () => {
    storeDashboard([tile("t-xg", "xG", "xG")]);
    const { container } = renderDashboard(fakeSource());
    expect(titleOf(container, "xG").classList.contains("col-source-fpl")).toBe(true);
    fireEvent.click(within(tileCard(container, "xG")).getByRole("button", { name: "Showing FPL's xG · Click to show Understat's" }));
    expect(titleOf(container, "xG").classList.contains("col-source-understat")).toBe(true);
    expect(titleOf(container, "xG").getAttribute("title")).toBe("Understat's figures: xG");
  });

  it("a card's header runs source mark, stopwatch, then Data View (<card_source_mark>)", () => {
    showStarter();
    const { container } = renderDashboard(fakeSource({ dashboardStarter: UNDERSTAT_DASHBOARD_STARTER }));
    for (const text of ["Points", "Shots/Game", "Price vs NPxGI/Game"]) {
      const icons = titleOf(container, text).nextElementSibling!;
      const order = [...icons.children].map((c) =>
        c.querySelector(".source-badge, .source-toggle") ? "source" : c.classList.contains("minutes-floor-badge") ? "stopwatch" : c.classList.contains("data-view-badge") ? "view" : "other",
      );
      expect(order, text).toEqual(["source", "stopwatch", "view"]);
    }
    expect(titleOf(container, "Price vs NPxGI/Game").nextElementSibling!.querySelector(".source-badge.col-source-crossover")).toBeTruthy();
  });

  it("FPL tiles are marked green with no second source mounted too", () => {
    storeDashboard([tile("t-fpl", "Goals", "goals")]);
    const { container } = renderDashboard(null);
    expect(titleOf(container, "Goals").classList.contains("col-source-fpl")).toBe(true);
    expect(tileCard(container, "Goals").querySelector(".source-badge.col-source-fpl svg")).toBeTruthy();
  });
});

// ---------- Player Comparison ----------

function storeComparison(elements: unknown[]) {
  localStorage.setItem("fpl-dashboard:comparison:views:v1", JSON.stringify({ version: 3, data: [{ id: "cmp-view-1", name: "Mine", elements, updatedAt: 1 }] }));
  localStorage.setItem("fpl-dashboard:comparison:selected-view:v1", JSON.stringify({ version: 1, data: "cmp-view-1" }));
}

function renderComparison(source: ExternalStatsSource | null, players = "1,2") {
  return render(
    <ExternalStatsContext.Provider value={source}>
      <MemoryRouter initialEntries={[`/player-comparison?players=${players}`]}>
        <PlayerComparison />
      </MemoryRouter>
    </ExternalStatsContext.Provider>,
  );
}

describe("Player Comparison with Understat mounted", () => {
  it("an Outputs panel lists Understat's own rows under violet headings, and a shared figure's row has its own ⇄", () => {
    storeComparison([{ id: "e1", kind: "outputs", name: "Both", dataView: "live", metricKeys: ["goals", "xG", "understat:us.shots"], minMinutes: 0 }]);
    const { container } = renderComparison(fakeSource());
    const panel = () => container.querySelector(".cmp-outputs") as HTMLElement;
    const headings = [...panel().querySelectorAll<HTMLElement>(".cmp-outputs-group")];
    // The Explorers' headings: "FPL ·" in green, Understat's in its colour, each with its icon.
    expect(headings.map((h) => h.textContent)).toEqual(["FPL · Output", "FPL · Underlying", "Understat · Shooting"]);
    expect(headings[0].querySelector(".menu-group-heading.col-source-fpl .menu-group-icon svg")).toBeTruthy();
    expect(headings[2].querySelector(".menu-group-heading.col-source-understat")).toBeTruthy();

    const rows = () => [...panel().querySelectorAll<HTMLElement>(".cmp-outputs-row")];
    const valuesOf = (row: HTMLElement) => [...row.querySelectorAll(".cmp-outputs-value")].map((v) => v.textContent);
    expect(valuesOf(rows()[0])).toEqual(["4", "2"]); // FPL goals: no toggle
    expect(rows()[0].querySelector(".source-toggle")).toBeNull();
    expect(valuesOf(rows()[1])).toEqual(["3.21", "1.11"]); // FPL's xG first
    expect(valuesOf(rows()[2])).toEqual(["25"]);
    // <card_source_mark>: FPL and Understat figures together, so its mark is the ⇄ (not a button: its rows have their own) and its title the crossover colour.
    const mark = () => panel().closest(".card")!.querySelector(".source-badge.col-source-crossover")!;
    expect(mark().getAttribute("title")).toBe("FPL's figures: Goals, xG · Understat's figures: Shots · In both sources: xG");
    expect(mark().closest("button")).toBeNull();
    const title = () => panel().closest(".card")!.querySelector(".card-title")!;
    expect(title().classList.contains("col-source-crossover")).toBe(true);
    expect(title().getAttribute("title")).toBe("FPL's figures: Goals, xG · Understat's figures: Shots");

    fireEvent.click(within(rows()[1]).getByRole("button", { name: "Showing FPL's xG · Click to show Understat's" }));
    // The row keeps its name and place; its figures are Understat's (Rice has none: no marker, never a 0), its name violet.
    expect(valuesOf(rows()[1])).toEqual(["4.56"]);
    expect(rows()[1].querySelector(".cmp-outputs-label")!.classList.contains("col-source-understat")).toBe(true);
    expect(mark().getAttribute("title")).toBe("FPL's figures: Goals · Understat's figures: xG, Shots · In both sources: xG");
    expect(title().getAttribute("title")).toBe("FPL's figures: Goals · Understat's figures: xG, Shots");
  });

  it("a card of FPL figures only has a green title, one of Understat's only a violet one (<card_source_mark>)", () => {
    storeComparison([
      { id: "e1", kind: "outputs", name: "FPL", dataView: "live", metricKeys: ["goals", "xG"], minMinutes: 0 },
      { id: "e2", kind: "outputs", name: "Understat", dataView: "live", metricKeys: ["understat:us.shots"], minMinutes: 0 },
    ]);
    const { container } = renderComparison(fakeSource());
    const titleOf = (text: string) => [...container.querySelectorAll(".card .card-title")].find((t) => t.textContent === text)!;
    expect(titleOf("FPL").classList.contains("col-source-fpl")).toBe(true);
    expect(titleOf("Understat").classList.contains("col-source-understat")).toBe(true);
    // Its mark: xG is in both sources, so the ⇄; Understat's own figures only, Understat's icon.
    expect(titleOf("FPL").closest(".card")!.querySelector(".source-badge.col-source-crossover")).toBeTruthy();
    expect(titleOf("Understat").closest(".card")!.querySelector(".source-badge.col-source-understat")).toBeTruthy();
  });

  it("the card dialog offers Understat's comparable figures under its own headings, and saves them by source", () => {
    storeComparison([]);
    const { getByRole, getByLabelText, container } = renderComparison(fakeSource());
    fireEvent.click(getByRole("button", { name: "Add Outputs Panel" }));
    const dialog = container.querySelector(".dialog") as HTMLElement;
    const headings = [...dialog.querySelectorAll(".menu-group-heading")].map((h) => h.textContent);
    expect(headings).toContain("FPL · Output");
    expect(headings).toContain("FPL & Understat");
    expect(headings).toContain("Understat · Shooting");
    expect(headings).not.toContain("Understat · Also in FPL");
    // xG is offered once, under the crossover heading.
    expect(within(dialog).getAllByRole("button", { name: "xG" })).toHaveLength(1);
    // +/- figures start nowhere on a bar that runs from 0, so neither source's is offered.
    expect(within(dialog).queryByRole("button", { name: "NP Goals − NPxG" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Goals − xG" })).toBeNull();

    fireEvent.change(getByLabelText("Name"), { target: { value: "Shooting" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Shots" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Outputs Panel" }));
    const stored = JSON.parse(localStorage.getItem("fpl-dashboard:comparison:views:v1")!);
    const view = stored.data.find((v: { id: string }) => v.id === "cmp-view-1");
    expect(view.elements[0].metricKeys).toEqual(["understat:us.shots"]);
  });

  it("with Understat switched off, a card built only from its figures says why", () => {
    storeComparison([{ id: "e1", kind: "radar", name: "Shooting", dataView: "live", metricKeys: ["understat:us.shots", "understat:us.xGChain", "understat:us.keyPasses"], minMinutes: 0 }]);
    const { container } = renderComparison(null);
    expect(container.textContent).toContain("This chart uses figures from a second data source that's switched off.");
  });

  it("a radar's ⇄ is in its header and switches every shared figure on it", () => {
    storeComparison([{ id: "e1", kind: "radar", name: "Mixed", dataView: "live", metricKeys: ["goals", "xG", "xA", "understat:us.shots"], minMinutes: 0 }]);
    const { container } = renderComparison(fakeSource());
    expect(container.textContent).not.toContain("no longer available");
    const card = container.querySelector(".card .source-toggle")!.closest(".card") as HTMLElement;
    // Its ⇄ toggle is its source mark (<card_source_mark>): no separate icon beside it.
    expect(card.querySelector(".source-badge")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Showing FPL's xG and xA · Click to show Understat's" }));
    expect(within(card).getByRole("button", { name: "Showing Understat's xG and xA · Click to show FPL's" }).getAttribute("aria-pressed")).toBe("true");
    expect(card.querySelector(".source-badge")).toBeNull();
  });
});
