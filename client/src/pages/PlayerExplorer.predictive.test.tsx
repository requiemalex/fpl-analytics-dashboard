import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerExplorer } from "./PlayerExplorer";
import { makePlayer, makeTeam } from "../test/fixtures";
import { percentileTint } from "../utils/colorScale";
import { normalizeExplorerViewSettings } from "../state/useExplorerViews";

// <predictive_columns>, <fixture_odds> and <player_forecasts> in Player
// Explorer: the same Predictive columns and Next 5 Fixtures as Add Players.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" }), makeTeam({ id: 2, shortName: "CHE", name: "Chelsea" })];
const PLAYERS = [
  makePlayer({
    id: 1,
    name: "Riser",
    position: "MID",
    teamId: 1,
    teamShortName: "ARS",
    totalPoints: 46,
    minutes: 900,
    epNext: 4,
    priceChange: { percent: 51.2, projections: [{ offsetDays: 0, projectedPercent: 101.5, likelihood: 5 }], lockedUntil: null, calibrating: false },
  }),
  makePlayer({ id: 2, name: "Faller", position: "MID", teamId: 2, teamShortName: "CHE", totalPoints: 30, minutes: 900, priceChange: { percent: -100, projections: [], lockedUntil: null, calibrating: false } }),
  makePlayer({ id: 3, name: "Steady", position: "DEF", teamId: 2, teamShortName: "CHE", totalPoints: 20, minutes: 900, priceChange: null }),
];

// GW9 is open for picks. A GW8 match not yet kicked off (Chelsea at home to
// Arsenal) belongs to a gameweek already under way: never one of the next five.
const FIXTURES = [
  { id: 1, eventId: 8, homeTeamId: 2, awayTeamId: 1, homeScore: null, awayScore: null, kickoffTime: "2026-10-30T20:00:00Z", finished: false, started: false, homeDifficulty: 4, awayDifficulty: 4 },
  { id: 2, eventId: 9, homeTeamId: 1, awayTeamId: 2, homeScore: null, awayScore: null, kickoffTime: "2026-11-07T15:00:00Z", finished: false, started: false, homeDifficulty: 5, awayDifficulty: 2 },
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [
      { id: 8, isNext: false, isCurrent: true, deadlineTime: "2026-10-24T10:00:00Z" },
      { id: 9, isNext: true, isCurrent: false, deadlineTime: "2026-11-07T11:00:00Z" },
    ],
    clubSeasons: [],
    historicReferenceSeason: null,
    seasonMatchesByPlayerId: new Map(),
    totalPlayers: 3,
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

afterEach(() => {
  cleanup();
  localStorage.clear();
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

const headerLabels = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).map((th) => th.childNodes[0]?.textContent?.trim() ?? "");

function toggleColumn(container: HTMLElement, getByRole: ReturnType<typeof render>["getByRole"], label: string) {
  fireEvent.click(getByRole("button", { name: /^Columns/ }));
  fireEvent.click(within(container.querySelector<HTMLElement>(".popover")!).getByLabelText(label));
  fireEvent.click(getByRole("button", { name: /^Columns/ }));
}

/** Each row's cell under `label`, by player name. */
function column(container: HTMLElement, label: string): Record<string, HTMLElement> {
  const index = headerLabels(container).indexOf(label);
  return Object.fromEntries(
    Array.from(container.querySelectorAll<HTMLElement>("table.data-table tbody tr")).map((tr) => [tr.querySelector(".name")?.textContent?.trim() ?? "", tr.children[index] as HTMLElement]),
  );
}

describe("Player Explorer — Predictive columns (<predictive_columns>)", () => {
  it("lists Add Players' Predictive columns in the Columns picker, all off by default", () => {
    const { container, getByRole } = renderExplorer();
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    const popover = container.querySelector<HTMLElement>(".popover")!;
    for (const label of ["Exp. Pts (FPL Official)", "Exp. Pts (Model Predicted)", "Exp. Mins", "Progress", "Predicted Progress"]) {
      expect((within(popover).getByLabelText(label) as HTMLInputElement).checked, label).toBe(false);
    }
    expect(headerLabels(container)).not.toContain("Exp. Pts (FPL Official)");
  });

  it("shows Exp. Pts straight after Player, with its gameweek picker", () => {
    const { container, getByRole } = renderExplorer();
    toggleColumn(container, getByRole, "Exp. Pts (FPL Official)");
    expect(headerLabels(container).slice(0, 2)).toEqual(["Player", "Exp. Pts (FPL Official)"]);
    expect(container.querySelector("thead select.horizon-picker")).not.toBeNull();
    expect(column(container, "Exp. Pts (FPL Official)").Riser.textContent).toMatch(/^\d+\.\d$/);
  });

  it("shows FPL's price Progress as the pitch does: signed, coloured by the figure itself, a missing one a dash", () => {
    const { container, getByRole } = renderExplorer();
    toggleColumn(container, getByRole, "Progress");
    toggleColumn(container, getByRole, "Predicted Progress");
    const progress = column(container, "Progress");
    expect(progress.Riser.textContent).toBe("+51.2%");
    expect(progress.Faller.textContent).toBe("−100.0%");
    expect(progress.Steady.textContent).toBe("—");
    // Full red at −100%, as on the pitch (<price_progress>).
    const asRendered = (css: string | undefined) => {
      const el = document.createElement("div");
      if (css) el.style.backgroundColor = css;
      return el.style.backgroundColor;
    };
    expect(progress.Faller.style.backgroundColor).toBe(asRendered(percentileTint(0)));
    expect(column(container, "Predicted Progress").Riser.textContent).toBe("+101.5%");
  });
});

describe("Player Explorer — Next 5 Fixtures (<player_forecasts>, <fixture_odds>)", () => {
  it("starts from the next deadline, as Add Players and the pitch do: never a match of the gameweek under way", () => {
    const { container, getByRole } = renderExplorer();
    toggleColumn(container, getByRole, "Next 5 Fixtures");
    const chips = Array.from(column(container, "Next 5 Fixtures").Riser.querySelectorAll(".table-fixture-chip")).map((c) => c.textContent);
    expect(chips).toEqual(["CHE"]);
  });

  it("switches between Games and Odds on its header, as the pitch's Fixtures toggle does", () => {
    const { container, getByRole } = renderExplorer();
    toggleColumn(container, getByRole, "Next 5 Fixtures");
    const picker = container.querySelector<HTMLElement>(".fixtures-view-picker")!;
    const [games, odds] = Array.from(picker.querySelectorAll<HTMLElement>("button"));
    expect(games.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(odds);
    expect(odds.getAttribute("aria-checked")).toBe("true");
    // No club records here, so no forecast yet: each match says so.
    const cell = column(container, "Next 5 Fixtures").Riser;
    expect(cell.querySelectorAll(".table-fixture-chip.is-odds")).toHaveLength(1);
    expect(cell.querySelector(".table-odds-kind")?.getAttribute("aria-label")).toMatch(/^Goals expected/);
    expect(column(container, "Next 5 Fixtures").Steady.querySelector(".table-odds-kind")?.getAttribute("aria-label")).toMatch(/^Clean sheet chance/);
  });
});

describe("Player Explorer — saved views keep the Predictive columns (<predictive_columns>)", () => {
  it("puts back the Predictive columns, their horizon and Odds", () => {
    const { container, getByRole, getByLabelText } = renderExplorer();
    toggleColumn(container, getByRole, "Progress");
    toggleColumn(container, getByRole, "Next 5 Fixtures");
    fireEvent.click(Array.from(container.querySelectorAll<HTMLElement>(".fixtures-view-picker button"))[1]);
    fireEvent.click(getByRole("button", { name: /^Saved views/ }));
    fireEvent.click(getByRole("button", { name: "Save current view" }));
    fireEvent.change(getByLabelText("Name"), { target: { value: "Risers" } });
    fireEvent.keyDown(getByLabelText("Name"), { key: "Enter" });

    fireEvent.click(getByRole("button", { name: /^Restore the default columns/ }));
    expect(headerLabels(container)).not.toContain("Progress");

    fireEvent.click(getByRole("button", { name: /^Saved views/ }));
    fireEvent.click(getByRole("button", { name: "Risers" }));
    expect(headerLabels(container).slice(0, 2)).toEqual(["Player", "Progress"]);
    expect(Array.from(container.querySelectorAll<HTMLElement>(".fixtures-view-picker button"))[1].getAttribute("aria-checked")).toBe("true");
  });

  it("a view saved before they were kept leaves the Predictive columns as they are", () => {
    localStorage.setItem(
      "scoutline:player-explorer:saved-views:v1",
      JSON.stringify({ version: 2, data: [{ id: "v2", name: "Old", settings: { analysisMode: "live", visibleColumns: ["totalPoints"] } }] }),
    );
    const { container, getByRole } = renderExplorer();
    toggleColumn(container, getByRole, "Progress");
    fireEvent.click(getByRole("button", { name: /^Saved views/ }));
    fireEvent.click(getByRole("button", { name: "Old" }));
    expect(headerLabels(container)).toContain("Progress");
  });

  it("reads a saved view's Predictive settings safely: unknown horizons fall back to 1, an unknown view to Games", () => {
    const s = normalizeExplorerViewSettings({ predictive: { columns: ["priceProgress", 7], horizons: { fpl: 9, model: 3 }, fixturesView: "bars" } });
    expect(s.predictive).toEqual({ columns: ["priceProgress"], horizons: { fpl: 1, model: 3 }, fixturesView: "games" });
    expect(normalizeExplorerViewSettings({}).predictive).toBeUndefined();
  });
});
