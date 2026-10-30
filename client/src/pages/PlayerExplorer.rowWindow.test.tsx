import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { downloadCsv } from "../utils/csvExport";

// <row_window>: a table whose scroll box has a height draws only the rows
// in it plus a margin, with spacers standing in for the rest. jsdom has no
// layout, so the box is given 600px here and every row counts as the
// 50px estimate: rows 0–11 are visible at the top, and the window draws
// 15 more either side, in steps of 10. Only the drawing is windowed:
// every sort, filter, count and export still covers every player.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS" }), makeTeam({ id: 2, shortName: "CHE" })];
const LONG_NAME = "Wolstenholme-Kowalczykowski";
const PLAYERS = Array.from({ length: 130 }, (_, i) => {
  const id = i + 1;
  return makePlayer({
    id,
    name: id === 125 ? LONG_NAME : `P${id}`,
    position: "MID",
    teamId: (id % 2) + 1,
    teamShortName: id % 2 ? "CHE" : "ARS",
    // Default sort (Points, highest first) puts them in id order.
    totalPoints: 200 - id,
    // Only a player far outside the first window has any goals.
    goals: id === 120 ? 9 : 0,
  });
});
const NAMES = PLAYERS.map((p) => p.name);

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
    historicFetchSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

vi.mock("../utils/csvExport", () => ({ downloadCsv: vi.fn() }));

const VIEWPORT = 600;
const ROW = 50;
let storedScrollTop = 0;

/** The scroll box's content height, as a browser would lay it out: the spacers plus the drawn rows. */
function contentHeight(wrap: Element): number {
  const spacers = Array.from(wrap.querySelectorAll<HTMLElement>("tr.row-window-spacer td")).reduce((sum, td) => sum + (parseFloat(td.style.height) || 0), 0);
  return spacers + drawnRows(wrap).length * ROW;
}

beforeEach(() => {
  storedScrollTop = 0;
  // No canvas in jsdom: the width-sizer's text estimate falls back to name length.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.classList.contains("table-wrap") ? VIEWPORT : 0;
  });
  // Like a browser, a scroll position past the content is pulled back to its end, and stays there.
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    if (!this.classList.contains("table-wrap")) return 0;
    storedScrollTop = Math.min(storedScrollTop, Math.max(0, contentHeight(this) - VIEWPORT));
    return storedScrollTop;
  });
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, value: number) {
    if (this.classList.contains("table-wrap")) storedScrollTop = value;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderExplorer() {
  const utils = render(
    <MemoryRouter initialEntries={["/players"]}>
      <PlayerExplorer />
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.click(utils.getByRole("button", { name: "Current Season" }));
  return utils;
}

function drawnRows(root: Element): Element[] {
  return Array.from(root.querySelectorAll("table.data-table tbody tr:not(.width-sizer-row):not(.row-window-spacer):not(.empty-row)"));
}

function rowNames(container: HTMLElement): string[] {
  return drawnRows(container).map((tr) => tr.querySelector("td:first-child .name")?.textContent?.trim() ?? "");
}

function spacerHeights(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>("tr.row-window-spacer td")).map((td) => parseFloat(td.style.height) || 0);
}

function scrollTo(container: HTMLElement, top: number) {
  const wrap = container.querySelector<HTMLElement>(".table-wrap")!;
  wrap.scrollTop = top;
  fireEvent.scroll(wrap);
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).find((el) => el.childNodes[0]?.textContent?.trim() === label);
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

describe("Player Explorer — only the rows in view are drawn (<row_window>)", () => {
  it("draws the visible rows and a margin, with spacers standing in for the rest at their height; the count covers everyone", () => {
    const { container } = renderExplorer();
    expect(rowNames(container)).toEqual(NAMES.slice(0, 30));
    expect(spacerHeights(container)).toEqual([0, (130 - 30) * ROW]);
    expect(container.querySelector(".count-pill")?.textContent).toBe("130/130 Players");
  });

  it("scrolling moves the window, keeping the rows in their sorted order", () => {
    const { container } = renderExplorer();
    scrollTo(container, 2000); // rows 40–51 visible
    expect(rowNames(container)).toEqual(NAMES.slice(20, 70));
    expect(spacerHeights(container)).toEqual([20 * ROW, (130 - 70) * ROW]);
    scrollTo(container, 130 * ROW - VIEWPORT); // the end
    expect(rowNames(container)).toEqual(NAMES.slice(100));
    expect(spacerHeights(container)).toEqual([100 * ROW, 0]);
  });

  it("a sort covers players outside the window", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Goals")); // first click: highest first
    expect(rowNames(container)[0]).toBe("P120");
  });

  it("a column filter covers players outside the window", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Goals").querySelector("button.column-filter-icon")!);
    const popover = container.querySelector<HTMLElement>(".column-filter-popover")!;
    fireEvent.change(popover.querySelectorAll("input[type=number]")[1], { target: { value: "1" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Enter" }));
    expect(rowNames(container)).toEqual(["P120"]);
  });

  it("a search made while scrolled far down shows its rows (the window follows the scroll position back)", () => {
    const { container, getByLabelText } = renderExplorer();
    scrollTo(container, 130 * ROW - VIEWPORT);
    fireEvent.change(getByLabelText("Search players"), { target: { value: "P12" } });
    expect(rowNames(container)).toEqual(["P12", "P120", "P121", "P122", "P123", "P124", "P126", "P127", "P128", "P129"]);
    fireEvent.change(getByLabelText("Search players"), { target: { value: "" } });
    expect(rowNames(container)).toEqual(NAMES.slice(0, 30));
  });

  it("Export CSV includes every row, not just the drawn ones", () => {
    const { getByRole } = renderExplorer();
    fireEvent.click(getByRole("button", { name: /Export the visible columns/ }));
    const [, , rows] = vi.mocked(downloadCsv).mock.calls.at(-1)!;
    expect(rows.map((r) => r[0])).toEqual(NAMES);
  });

  it("the widest undrawn cells sit in hidden stand-in rows, the fixed Ownership/Price/Team/Position cells included, so columns don't shift while scrolling", () => {
    const { container } = renderExplorer();
    const sizer = () => Array.from(container.querySelectorAll("tr.width-sizer-row"));
    expect(sizer().map((tr) => tr.querySelector(".name")?.textContent?.trim())).toContain(LONG_NAME);
    const row = sizer().find((tr) => tr.querySelector(".name")?.textContent?.trim() === LONG_NAME)!;
    expect(row.getAttribute("aria-hidden")).toBe("true");
    // Player, then Ownership, Price, Team, Position: the same cells as his real row.
    expect(row.querySelectorAll("td")).toHaveLength(5);
    // Once he's in the window, his real row stands for itself.
    scrollTo(container, 130 * ROW - VIEWPORT);
    expect(rowNames(container)).toContain(LONG_NAME);
    expect(sizer().map((tr) => tr.querySelector(".name")?.textContent?.trim())).not.toContain(LONG_NAME);
  });

  it("a Team badge still opens the club's profile (<team_badge_opener>)", () => {
    const { container, getByTestId } = renderExplorer();
    const badge = within(drawnRows(container)[0] as HTMLElement).getAllByRole("button", { name: "View CHE team profile" })[0];
    fireEvent.click(badge);
    expect(getByTestId("location").textContent).toContain("teamProfile=2");
  });
});
