import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { downloadCsv } from "../utils/csvExport";
import { INITIAL_ROW_COUNT } from "../state/useProgressiveRowCount";

// Large tables draw their first rows at once and the rest over the following
// frames (useProgressiveRowCount). These check that only the drawing is
// staged: every sort, filter, count and export still covers every player.

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
    // Only a player far outside the first staged rows has any goals.
    goals: id === 120 ? 9 : 0,
  });
});

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  // No canvas in jsdom: the width-sizer's text estimate falls back to name length.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderExplorer() {
  const utils = render(
    <MemoryRouter initialEntries={["/players"]}>
      <PlayerExplorer />
    </MemoryRouter>,
  );
  fireEvent.click(utils.getByRole("button", { name: "Current Season" }));
  return utils;
}

function drawAllFrames() {
  for (let i = 0; i < 10; i++) {
    act(() => {
      vi.advanceTimersToNextFrame();
    });
  }
}

function rowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("table.data-table tbody tr:not(.width-sizer-row) td:first-child .name")).map((el) => el.textContent?.trim() ?? "");
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).find((el) => el.childNodes[0]?.textContent?.trim() === label);
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

describe("Player Explorer — staged drawing of a large table", () => {
  it("draws the first rows at once and the rest without any scrolling; the count covers everyone throughout", () => {
    const { container } = renderExplorer();
    expect(rowNames(container)).toHaveLength(INITIAL_ROW_COUNT);
    expect(container.querySelector(".count-pill")?.textContent).toBe("130/130 Players");
    drawAllFrames();
    expect(rowNames(container)).toEqual(PLAYERS.map((p) => p.name));
  });

  it("a sort made before every row is drawn still sorts all players", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Goals")); // first click: highest first
    expect(rowNames(container)[0]).toBe("P120");
  });

  it("a column filter covers players not drawn yet", () => {
    const { container } = renderExplorer();
    fireEvent.click(header(container, "Goals").querySelector("button.column-filter-icon")!);
    const popover = container.querySelector<HTMLElement>(".column-filter-popover")!;
    fireEvent.change(popover.querySelectorAll("input[type=number]")[1], { target: { value: "1" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Enter" }));
    expect(rowNames(container)).toEqual(["P120"]);
  });

  it("Export CSV includes every row, even while rows are still being drawn", () => {
    const { getByRole } = renderExplorer();
    fireEvent.click(getByRole("button", { name: /Export the visible columns/ }));
    const [, , rows] = vi.mocked(downloadCsv).mock.calls.at(-1)!;
    expect(rows.map((r) => r[0])).toEqual(PLAYERS.map((p) => p.name));
  });

  it("the longest undrawn name sits in a hidden stand-in row until the real rows are all drawn", () => {
    const { container } = renderExplorer();
    const sizers = () => Array.from(container.querySelectorAll("tr.width-sizer-row .name")).map((el) => el.textContent?.trim());
    expect(sizers()).toContain(LONG_NAME);
    expect(container.querySelector("tr.width-sizer-row")?.getAttribute("aria-hidden")).toBe("true");
    drawAllFrames();
    expect(container.querySelectorAll("tr.width-sizer-row")).toHaveLength(0);
    expect(rowNames(container)).toContain(LONG_NAME);
  });

  it("a search that shrinks the list, once cleared, stages the rows back in", () => {
    const { container, getByLabelText } = renderExplorer();
    drawAllFrames();
    fireEvent.change(getByLabelText("Search players"), { target: { value: "P12" } });
    expect(rowNames(container)).toEqual(["P12", "P120", "P121", "P122", "P123", "P124", "P126", "P127", "P128", "P129"]);
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    fireEvent.change(getByLabelText("Search players"), { target: { value: "" } });
    expect(rowNames(container)).toHaveLength(INITIAL_ROW_COUNT);
    drawAllFrames();
    expect(rowNames(container)).toHaveLength(130);
  });
});
