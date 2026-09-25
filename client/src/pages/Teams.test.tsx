import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Teams } from "./Teams";
import { makeTeam } from "../test/fixtures";
import { downloadCsv } from "../utils/csvExport";
import type { TeamAggregate } from "../metrics/teamStats";

const TEAMS = [
  makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" }),
  makeTeam({ id: 2, shortName: "MUN", name: "Man Utd" }),
  makeTeam({ id: 3, shortName: "NFO", name: "Nott'm Forest" }),
];

/** Club figures straight from the mocked computeTeamAggregates — the page's own job is showing, searching, filtering and sorting them. */
const AGGREGATES = vi.hoisted(() => {
  const base = { points: 1500, goals: 50, assists: 40, bonus: 90, xA: 40, xGI: 100, defensiveContributions: 900, cleanSheets: 10, played: 38, draws: 8, losses: 8 };
  return [
    { ...base, teamId: 3, name: "Nott'm Forest", shortName: "NFO", leaguePosition: 3, leaguePoints: 50, goalsFor: 45, goalsAgainst: 50, xG: 44.123, xGC: 50, wins: 14 },
    { ...base, teamId: 1, name: "Arsenal", shortName: "ARS", leaguePosition: 1, leaguePoints: 85, goalsFor: 71, goalsAgainst: 27, xG: 66.74, xGC: 28, wins: 26 },
    { ...base, teamId: 2, name: "Man Utd", shortName: "MUN", leaguePosition: 2, leaguePoints: 71, goalsFor: 69, goalsAgainst: 50, xG: 64.97, xGC: 48, wins: 21 },
  ];
});

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    clubSeasons: [],
    historicReferenceSeason: "2025/26",
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

vi.mock("../metrics/teamStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../metrics/teamStats")>()),
  computeTeamAggregates: (): TeamAggregate[] => AGGREGATES.map((a) => ({ ...a })),
}));

vi.mock("../utils/csvExport", () => ({ downloadCsv: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(downloadCsv).mockClear();
});

function renderTeams() {
  return render(
    <MemoryRouter initialEntries={["/teams"]}>
      <Teams />
    </MemoryRouter>,
  );
}

function rowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("table.data-table tbody tr td:first-child .name")).map((el) => el.textContent?.trim() ?? "");
}

function headerLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).map((th) => th.childNodes[0]?.textContent?.trim() ?? "");
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).find((el) => el.childNodes[0]?.textContent?.trim() === label);
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

/** Opens a column's ▾ filter, types a value into one of its three boxes (0 ≤, 1 ≥, 2 =), and presses Enter. */
function applyNumericFilter(container: HTMLElement, label: string, box: number, value: string) {
  fireEvent.click(header(container, label).querySelector("button.column-filter-icon")!);
  const input = container.querySelectorAll(".column-filter-popover input[type=number]")[box];
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function toggleColumn(container: HTMLElement, getByRole: ReturnType<typeof render>["getByRole"], label: string) {
  if (!container.querySelector(".popover:not(.column-filter-popover)")) fireEvent.click(getByRole("button", { name: /^Columns/ }));
  fireEvent.click(within(container.querySelector<HTMLElement>(".popover")!).getByLabelText(label));
}

describe("Team Explorer", () => {
  it("opens on the league table, sorted by position, with the extra Dashboard metrics off", () => {
    const { container } = renderTeams();
    expect(headerLabels(container)).toEqual(["Team", "League Position", "League Points", "Goals For", "Goals Against", "Clean Sheets", "xG", "xGC", "xA", "FPL Points"]);
    expect(rowNames(container)).toEqual(["Arsenal", "Man Utd", "Nott'm Forest"]);
    expect(container.querySelector(".count-pill")?.textContent).toBe("3/3 Teams");
  });

  it("the Columns picker offers every team metric and adds one to the end when ticked", () => {
    const { container, getByRole } = renderTeams();
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    const popover = within(container.querySelector<HTMLElement>(".popover")!);
    for (const label of ["Played", "Wins", "Draws", "Losses", "Goal Difference", "Goals (excl. OGs)", "Assists", "Bonus Points", "xGI", "Def. Contributions"]) {
      expect((popover.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
    }
    fireEvent.click(popover.getByLabelText("Wins"));
    expect(headerLabels(container).at(-1)).toBe("Wins");
    expect(Array.from(container.querySelectorAll("tbody tr:first-child td")).at(-1)?.textContent).toBe("26");
  });

  it("the Team name search is accent- and order-insensitive, over name and short name", () => {
    const { container, getByLabelText, getByPlaceholderText } = renderTeams();
    expect(getByPlaceholderText("Team name…")).toBe(getByLabelText("Search teams"));
    fireEvent.change(getByLabelText("Search teams"), { target: { value: "utd man" } });
    expect(rowNames(container)).toEqual(["Man Utd"]);
    fireEvent.change(getByLabelText("Search teams"), { target: { value: "nfo" } });
    expect(rowNames(container)).toEqual(["Nott'm Forest"]);
    fireEvent.change(getByLabelText("Search teams"), { target: { value: "forest" } });
    expect(rowNames(container)).toEqual(["Nott'm Forest"]);
  });

  it("a column filter narrows the rows, comparing values as displayed", () => {
    const { container } = renderTeams();
    applyNumericFilter(container, "League Points", 1, "70");
    expect(rowNames(container)).toEqual(["Arsenal", "Man Utd"]);
    expect(header(container, "League Points").querySelector("button.column-filter-icon")?.className).toContain("active");
    expect(container.querySelector(".count-pill")?.textContent).toBe("2/3 Teams");
    // 44.123 is shown as "44.12", so typing what's on screen matches it.
    applyNumericFilter(container, "League Points", 1, "0");
    applyNumericFilter(container, "xG", 2, "44.12");
    expect(rowNames(container)).toEqual(["Nott'm Forest"]);
  });

  it("shows an empty state, header intact, when nothing matches", () => {
    const { container, getByText } = renderTeams();
    applyNumericFilter(container, "League Points", 1, "100");
    expect(rowNames(container)).toEqual([]);
    expect(getByText("No teams match your filters")).toBeTruthy();
    expect(header(container, "League Points")).toBeTruthy();
  });

  it("hiding a filtered or sorted column drops its filter and sort", () => {
    const { container, getByRole } = renderTeams();
    fireEvent.click(header(container, "League Points"));
    fireEvent.click(header(container, "League Points"));
    expect(rowNames(container)).toEqual(["Nott'm Forest", "Man Utd", "Arsenal"]);
    applyNumericFilter(container, "League Points", 0, "80");
    expect(rowNames(container)).toEqual(["Nott'm Forest", "Man Utd"]);
    toggleColumn(container, getByRole, "League Points");
    expect(rowNames(container)).toEqual(["Arsenal", "Man Utd", "Nott'm Forest"]);
  });

  it("Reset restores the default columns and clears the search and every filter", () => {
    const { container, getByRole, getByLabelText } = renderTeams();
    toggleColumn(container, getByRole, "Wins");
    toggleColumn(container, getByRole, "xA");
    fireEvent.change(getByLabelText("Search teams"), { target: { value: "arsenal" } });
    applyNumericFilter(container, "League Points", 1, "80");
    fireEvent.click(getByRole("button", { name: /^Restore the default columns/ }));
    expect(headerLabels(container)).toEqual(["Team", "League Position", "League Points", "Goals For", "Goals Against", "Clean Sheets", "xG", "xGC", "xA", "FPL Points"]);
    expect((getByLabelText("Search teams") as HTMLInputElement).value).toBe("");
    expect(rowNames(container)).toEqual(["Arsenal", "Man Utd", "Nott'm Forest"]);
  });

  it("Export CSV matches the table: visible columns in order, current rows, displayed values", () => {
    const { container, getByRole, getByLabelText } = renderTeams();
    toggleColumn(container, getByRole, "Clean Sheets");
    fireEvent.change(getByLabelText("Search teams"), { target: { value: "forest" } });
    fireEvent.click(getByRole("button", { name: /^Export/ }));
    const [, headers, rows] = vi.mocked(downloadCsv).mock.calls[0];
    expect(headers).toEqual(["Team", "League Position", "League Points", "Goals For", "Goals Against", "xG", "xGC", "xA", "FPL Points"]);
    expect(rows).toEqual([["Nott'm Forest", "3", "50", "45", "50", "44.12", "50.00", "40.00", "1,500"]]);
  });
});
