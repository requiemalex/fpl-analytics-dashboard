import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { downloadCsv } from "../utils/csvExport";

// Audit 2026-09-25 (Player Explorer). Tests named after a finding ID (H1, M2…)
// guard the fix for that finding in
// docs/audits/results/2026-09-25-player-explorer/ (1-audit.md, 2-remediation.md).

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" }), makeTeam({ id: 2, shortName: "CHE", name: "Chelsea" })];
const PLAYERS = [
  // 46 / £3.0m = 15.333… Pts/£m, shown as "15.3".
  makePlayer({ id: 1, name: "Zubimendi", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 46, price: 3 }),
  makePlayer({ id: 2, name: "Ødegaard", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 30, price: 8 }),
  makePlayer({ id: 3, name: "Ángel", position: "DEF", teamId: 2, teamShortName: "CHE", totalPoints: 20, price: 5 }),
  makePlayer({ id: 4, name: "Bob", position: "FWD", teamId: 2, teamShortName: "CHE", totalPoints: 10, price: 6 }),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    advancedFieldAvailability: null,
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

vi.mock("../utils/csvExport", () => ({ downloadCsv: vi.fn() }));

afterEach(cleanup);

/** Shows the router's current query string, so a test can check what's left in the address. */
function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

/** Renders the page at `url` and switches to Current Season, so every row uses the fixture players' own (live) figures. */
function renderExplorer(url = "/players") {
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <PlayerExplorer />
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.click(utils.getByRole("button", { name: "Current Season" }));
  return utils;
}

function rowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("table.data-table tbody tr td:first-child .name")).map((el) => el.textContent?.trim() ?? "");
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).find(
    (el) => el.childNodes[0]?.textContent?.trim() === label,
  );
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

function openColumnFilter(container: HTMLElement, label: string): HTMLElement {
  fireEvent.click(header(container, label).querySelector("button.column-filter-icon")!);
  return container.querySelector<HTMLElement>(".column-filter-popover")!;
}

/** Fills one of the numeric filter fields (0 = ≤, 1 = ≥, 2 = =) and clicks Enter. */
function applyNumericFilter(container: HTMLElement, label: string, field: 0 | 1 | 2, value: string) {
  const popover = openColumnFilter(container, label);
  fireEvent.change(popover.querySelectorAll("input[type=number]")[field], { target: { value } });
  fireEvent.click(within(popover).getByRole("button", { name: "Enter" }));
}

function applyCategoryFilter(container: HTMLElement, label: string, value: string) {
  const popover = openColumnFilter(container, label);
  fireEvent.change(popover.querySelector("select")!, { target: { value } });
  fireEvent.click(within(popover).getByRole("button", { name: "Enter" }));
}

describe("Player Explorer — table basics", () => {
  it("lists every player, highest Points first, with the shown/total count", () => {
    const { container } = renderExplorer();
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard", "Ángel", "Bob"]);
    expect(container.querySelector(".count-pill")?.textContent).toBe("4/4 Players");
  });

  it("the Team column's filter shows only that club's players", () => {
    const { container } = renderExplorer();
    applyCategoryFilter(container, "Team", "CHE");
    expect(rowNames(container)).toEqual(["Ángel", "Bob"]);
    expect(header(container, "Team").querySelector("button.column-filter-icon")?.className).toContain("active");
  });

  it("a numeric ≥ filter keeps only rows at or above the value", () => {
    const { container } = renderExplorer();
    applyNumericFilter(container, "Points", 1, "30");
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
  });

  it("search narrows by name, ignoring accents", () => {
    const { container, getByLabelText } = renderExplorer();
    fireEvent.change(getByLabelText("Search players"), { target: { value: "odegaard" } });
    expect(rowNames(container)).toEqual(["Ødegaard"]);
  });

  it("Export CSV writes the same headers, rows and formatted values as the table on screen", () => {
    const { container, getByRole } = renderExplorer();
    fireEvent.click(getByRole("button", { name: /Export the visible columns/ }));
    const [, headers, rows] = vi.mocked(downloadCsv).mock.calls.at(-1)!;
    const screenHeaders = Array.from(container.querySelectorAll("table.data-table thead th")).map((th) => th.childNodes[0]?.textContent?.trim());
    expect(headers).toEqual(screenHeaders);
    const firstRow = Array.from(container.querySelectorAll("table.data-table tbody tr:first-child td")).map((td, i) =>
      i === 0 ? td.querySelector(".name")?.textContent?.trim() : td.textContent?.trim(),
    );
    expect(rows[0]).toEqual(firstRow);
    expect(rows.map((r) => r[0])).toEqual(rowNames(container));
  });
});

describe("Player Explorer — findings from the 2026-09-25 audit", () => {
  it("H1: arriving from Teams (?team=1) shows the Team column's filter as active", () => {
    const { container } = renderExplorer("/players?team=1");
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
    expect(header(container, "Team").querySelector("button.column-filter-icon")?.className).toContain("active");
  });

  it("H1: after arriving from Teams, choosing another club in the Team column shows that club's players", () => {
    const { container } = renderExplorer("/players?team=1");
    applyCategoryFilter(container, "Team", "CHE");
    expect(rowNames(container)).toEqual(["Ángel", "Bob"]);
  });

  it("M2: 'Equal to' matches a value typed exactly as the table displays it", () => {
    const { container } = renderExplorer();
    expect(header(container, "Pts/£m")).toBeTruthy();
    const ptsPerMillionCell = Array.from(container.querySelectorAll("table.data-table tbody tr:first-child td")).map((td) => td.textContent?.trim());
    expect(ptsPerMillionCell).toContain("15.3");
    applyNumericFilter(container, "Pts/£m", 2, "15.3");
    expect(rowNames(container)).toEqual(["Zubimendi"]);
  });

  it("L3: sorting by Player A→Z is alphabetical, accented names included", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Player")); // first click: descending
    fireEvent.click(header(container, "Player")); // second click: ascending
    expect(rowNames(container)).toEqual(["Ángel", "Bob", "Ødegaard", "Zubimendi"]);
  });
});

describe("Player Explorer — phase 2 regression tests (2026-09-25 audit)", () => {
  it("H1: the ?team= hand-off leaves the address, so Clear filters shows everyone and nothing re-applies it", () => {
    const { container, getByRole, getByTestId } = renderExplorer("/players?team=1");
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
    expect(getByTestId("location-search").textContent).toBe("");
    fireEvent.click(getByRole("button", { name: /Clear every filter/ }));
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard", "Ángel", "Bob"]);
    expect(header(container, "Team").querySelector("button.column-filter-icon")?.className).not.toContain("active");
  });

  it("H1: an unknown ?team= id is ignored rather than showing nobody", () => {
    const { container } = renderExplorer("/players?team=99");
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard", "Ángel", "Bob"]);
  });

  it("M3: hiding a filtered column removes its filter", () => {
    const { container, getByRole } = renderExplorer();
    applyNumericFilter(container, "Points", 1, "30");
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    fireEvent.click(within(container.querySelector<HTMLElement>(".popover")!).getByLabelText("Points"));
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard", "Ángel", "Bob"]);
    // Showing it again brings the column back unfiltered.
    fireEvent.click(within(container.querySelector<HTMLElement>(".popover")!).getByLabelText("Points"));
    expect(header(container, "Points").querySelector("button.column-filter-icon")?.className).not.toContain("active");
  });

  it("L1: pressing Enter in a filter box applies it, and Escape closes the popover without applying", () => {
    const { container } = renderExplorer();
    let popover = openColumnFilter(container, "Points");
    const gte = popover.querySelectorAll("input[type=number]")[1];
    fireEvent.change(gte, { target: { value: "30" } });
    fireEvent.keyDown(gte, { key: "Enter" });
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
    expect(container.querySelector(".column-filter-popover")).toBeNull();

    popover = openColumnFilter(container, "Points");
    fireEvent.change(popover.querySelectorAll("input[type=number]")[1], { target: { value: "40" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".column-filter-popover")).toBeNull();
    expect(rowNames(container)).toEqual(["Zubimendi", "Ødegaard"]);
  });

  it("L1: the Columns picker closes on Escape and on a click outside it", () => {
    const { container, getByRole } = renderExplorer();
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    expect(container.querySelector(".popover")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".popover")).toBeNull();
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    fireEvent.mouseDown(container.querySelector("table.data-table")!);
    expect(container.querySelector(".popover")).toBeNull();
  });

  it("L2: a range no value can meet can't be applied", () => {
    const { container } = renderExplorer();
    const popover = openColumnFilter(container, "Points");
    const [lte, gte] = popover.querySelectorAll("input[type=number]");
    fireEvent.change(lte, { target: { value: "10" } });
    fireEvent.change(gte, { target: { value: "20" } });
    const enter = within(popover).getByRole("button", { name: "Enter" }) as HTMLButtonElement;
    expect(enter.disabled).toBe(true);
    fireEvent.keyDown(gte, { key: "Enter" });
    expect(rowNames(container)).toHaveLength(4);
  });

  it("L4: Position sorts in pitch order (GKP, DEF, MID, FWD) on the first click", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Position"));
    expect(rowNames(container)).toEqual(["Ángel", "Zubimendi", "Ødegaard", "Bob"]);
  });

  it("L9: each column's filter button has an accessible name", () => {
    const { container } = renderExplorer();
    expect(header(container, "Points").querySelector("button.column-filter-icon")?.getAttribute("aria-label")).toBe("Filter this column");
  });
});
