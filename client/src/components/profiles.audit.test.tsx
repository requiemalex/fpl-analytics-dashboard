import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerDetailOverlay } from "./PlayerDetailOverlay";
import { TeamDetailOverlay } from "./TeamDetailOverlay";
import { makePlayer, makeTeam, makeSeason } from "../test/fixtures";
import type { NormalizedPlayer, PlayerGameweekHistory, PlayerSeasonHistory } from "../types/normalized";

// Audit 2026-09-25 (player and team profiles), 1-audit.md. Each test states
// the correct behaviour; the ones marked it.fails expose a finding (ID in the
// name) and should pass once Phase 2 fixes it.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" }), makeTeam({ id: 2, shortName: "CHE", name: "Chelsea" })];

const state = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  history: {} as Record<string, unknown>,
}));

vi.mock("../state/AppStateContext", () => ({ useAppState: () => state.app }));
vi.mock("../state/usePlayerHistory", () => ({ usePlayerHistory: () => state.history }));

function gw(round: number, overrides: Partial<PlayerGameweekHistory> = {}): PlayerGameweekHistory {
  return {
    round,
    minutes: 90,
    starts: 1,
    totalPoints: 6,
    wasHome: true,
    opponentTeamId: 2,
    teamScore: 1,
    opponentScore: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 1,
    goalsConceded: 0,
    ownGoals: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    bonus: 0,
    bps: 20,
    defensiveContribution: 10,
    tackles: 2,
    clearancesBlocksInterceptions: 5,
    recoveries: 3,
    xG: 0.1,
    xA: 0.1,
    xGI: 0.2,
    xGC: 0.8,
    ...overrides,
  };
}

function setApp(players: NormalizedPlayer[], overrides: Record<string, unknown> = {}) {
  state.app = {
    players,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    clubSeasons: [],
    historicReferenceSeason: "2025/26",
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    historicProfiles: new Map(),
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
    ...overrides,
  };
}

function setHistory(history: PlayerGameweekHistory[], seasonHistory: PlayerSeasonHistory[] = []) {
  state.history = { status: "ready", history, seasonHistory, errorMessage: null, retry: () => {} };
}

function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  setApp([makePlayer({ id: 1, name: "Saliba", position: "DEF", teamId: 1, teamName: "Arsenal", totalPoints: 30, minutes: 450 })]);
  setHistory([gw(1), gw(2), gw(3), gw(4), gw(5)]);
});

afterEach(cleanup);

describe("Player profile — Career History's live season", () => {
  // H2: before a ball is kicked, FPL's bootstrap still carries last season's
  // totals (README "Analysis modes", <live_mode_preseason_fix>). The live row
  // must read 0, as Current Season does everywhere else — not repeat last
  // season's 209 points as the new season's.
  it.fails("H2: pre-season, the '(live)' Career History row shows 0 points, not last season's carried-over total", () => {
    const carried = makePlayer({ id: 1, name: "Gabriel", position: "DEF", teamId: 1, totalPoints: 209, minutes: 2750, goals: 4 });
    setApp([carried], { currentSeasonHasStarted: false });
    setHistory([], [makeSeason({ seasonName: "2025/26", totalPoints: 209, minutes: 2750, goals: 4 })]);
    const { getByLabelText, getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByLabelText("Show season-by-season detail"));
    const liveRow = getByText(/2026\/27 \(live\)/).closest("tr")!;
    const cells = [...liveRow.querySelectorAll("td")].map((td) => Number((td.textContent ?? "").replace(/,/g, "")));
    // Season, Price, Mins, Starts, Points…
    expect(cells[2]).toBe(0);
    expect(cells[4]).toBe(0);
  });
});

describe("Player profile — while historic data is still loading", () => {
  // M2: the profile opens on Last Completed Season, which needs the historic
  // dataset. Until it arrives the player has not been shown to have no data.
  it.fails("M2: does not tell the user the player has no data while the historic dataset is loading", () => {
    setApp(state.app.players as NormalizedPlayer[], { historicStatus: "loading", historicReferenceSeason: null });
    const { queryByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(queryByText(/No data for Saliba in this mode/)).toBeNull();
    expect(queryByText(/Small sample/)).toBeNull();
  });
});

describe("Player profile — gameweek log", () => {
  // L1: whole-number counts show as whole numbers (the rest of the app shows
  // minutes as "90", not "90.00").
  it.fails("L1: Prime shows 90 minutes as '90', not '90.00'", () => {
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const prime = getAllByText("Minutes")[0].closest("table")!;
    const headers = [...prime.querySelectorAll("thead th")].map((th) => th.textContent);
    const firstRow = [...prime.querySelectorAll("tbody tr")[0].querySelectorAll("td")].map((td) => td.textContent);
    expect(firstRow[headers.indexOf("Minutes")]).toBe("90");
    expect(firstRow[headers.indexOf("Points")]).toBe("6");
  });

  // M4: a double gameweek gives two history entries with the same round. Both
  // must render as separate rows, without React's duplicate-key error.
  it.fails("M4: a double gameweek renders both fixtures without a duplicate-key error", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    setHistory([gw(1), gw(2, { opponentTeamId: 2 }), gw(2, { opponentTeamId: 1, wasHome: false })]);
    render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const keyErrors = errors.mock.calls.filter((c) => String(c[0]).includes("same key"));
    expect(keyErrors).toHaveLength(0);
  });

  it("totals and averages sum the gameweeks shown", () => {
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    // 5 gameweeks × 6 points, shown in Prime's Totals row; average 6.0.
    expect(getAllByText("Totals").length).toBe(2);
    expect(getAllByText("6.0").length).toBeGreaterThan(0);
  });
});

describe("Team profile — closing", () => {
  // M5: every other overlay and popover closes on Escape (README: "Escape
  // closes only the most recently opened layer"); the player profile does.
  it.fails("M5: Escape closes the team profile (removes ?teamProfile= from the address)", () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(getByTestId("location-search").textContent).toBe("?teamProfile=1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getByTestId("location-search").textContent).toBe("");
  });

  it("the × button closes the team profile", () => {
    const { getByTestId, getByLabelText } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(getByLabelText("Close"));
    expect(getByTestId("location-search").textContent).toBe("");
  });

  it("a club with no record for the Data View shows '—', never 0", () => {
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    // Season Totals: 8 tiles, all "—" with no club seasons loaded.
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(8);
  });
});

describe("Opening overlays does not start the historic build", () => {
  // M3: both overlays are mounted on every page (App.tsx) and requested the
  // historic dataset on mount even with nothing open — README: the build
  // "never runs at startup"; only a page (or open profile) that needs it
  // should ask.
  it.fails("M3: neither overlay requests historic data when no profile is open", () => {
    const request = vi.fn();
    setApp(state.app.players as NormalizedPlayer[], { requestHistoricData: request });
    render(
      <MemoryRouter initialEntries={["/guide"]}>
        <PlayerDetailOverlay />
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
