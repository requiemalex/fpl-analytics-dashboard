import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerDetailOverlay } from "./PlayerDetailOverlay";
import { TeamDetailOverlay } from "./TeamDetailOverlay";
import { TeamBadge } from "./primitives";
import { PlayerComparison } from "../pages/PlayerComparison";
import { buildHistoricPlayerProfile } from "../metrics/historicAnalysis";
import { percentileTint } from "../utils/colorScale";
import { makePlayer, makeTeam, makeSeason } from "../test/fixtures";
import type { ClubPlayerSeason, ClubSeason, NormalizedPlayer, PlayerGameweekHistory, PlayerSeasonHistory } from "../types/normalized";

// Audit 2026-09-25 (player and team profiles). Each test states the correct
// behaviour; a finding ID in the name (1-audit.md) marks a regression test
// for that finding, fixed in Phase 2 (2-remediation.md).

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" }), makeTeam({ id: 2, shortName: "CHE", name: "Chelsea" })];

const state = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  history: {} as Record<string, unknown>,
}));

vi.mock("../state/AppStateContext", () => ({ useAppState: () => state.app }));
vi.mock("../state/usePlayerHistory", () => ({ usePlayerHistory: () => state.history }));

function gw(round: number, overrides: Partial<PlayerGameweekHistory> = {}): PlayerGameweekHistory {
  return {
    fixtureId: round,
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
    allTimeSeasonsByPlayerId: new Map(),
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
  it("H2: pre-season, the '(live)' Career History row shows 0 points, not last season's carried-over total", () => {
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
  it("M2: does not tell the user the player has no data while the historic dataset is loading", () => {
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
  it("L1: Prime shows 90 minutes as '90', not '90.00'", () => {
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
  it("M4: a double gameweek renders both fixtures without a duplicate-key error", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    setHistory([gw(1), gw(2, { fixtureId: 21, opponentTeamId: 2 }), gw(2, { fixtureId: 22, opponentTeamId: 1, wasHome: false })]);
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
  it("M5: Escape closes the team profile (removes ?teamProfile= from the address)", () => {
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
  it("M3: neither overlay requests historic data when no profile is open", () => {
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

// ---------------------------------------------------------------------------
// Phase 2 regression tests (2-remediation.md). Each fails on the Phase 1 code.
// ---------------------------------------------------------------------------

/** Historic profiles for the pool, against the reference season setApp uses. */
function profiles(seasonsById: Record<number, PlayerSeasonHistory[]>) {
  return new Map(Object.entries(seasonsById).map(([id, seasons]) => [Number(id), buildHistoricPlayerProfile(seasons, "2025/26")]));
}

/** A CSS colour as jsdom stores it, so a rendered style can be compared with percentileTint's output. */
function asRendered(css: string | undefined): string {
  const el = document.createElement("div");
  if (css) el.style.background = css;
  return el.style.background;
}

function clubPlayer(code: number, overrides: Partial<ClubPlayerSeason> = {}): ClubPlayerSeason {
  return { code, minutes: 3000, starts: 33, totalPoints: 120, goals: 2, assists: 3, cleanSheets: 12, bonus: 10, xG: 2, xA: 2, xGI: 4, xGC: 40, dc: 300, ...overrides };
}

function clubSeason(code: number, season: string, overrides: Partial<ClubSeason> = {}): ClubSeason {
  return {
    season,
    code,
    name: `Club ${code}`,
    shortName: `C${code}`,
    complete: true,
    played: 38,
    wins: 20,
    draws: 10,
    losses: 8,
    goalsFor: 60,
    goalsAgainst: 40,
    cleanSheets: 12,
    leaguePoints: 70,
    leaguePosition: 4,
    fantasyPoints: 1800,
    goals: 58,
    assists: 45,
    bonus: 100,
    xG: 55,
    xA: 40,
    xGI: 95,
    xGC: 42,
    dc: 2800,
    players: [],
    ...overrides,
  };
}

// A reserve full-back (Ben Davies in the audit: 136 minutes, 0.49 xG) and a
// regular (3,035 minutes, 1.0 xG) — the cameo's xG/Game is far higher.
const CAMEO = makePlayer({ id: 1, name: "Davies", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
const REGULAR = makePlayer({ id: 2, name: "Konsa", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
const LAST_SEASON = {
  1: [makeSeason({ seasonName: "2025/26", minutes: 136, totalPoints: 8, xG: 0.49, xA: 0.07, xGI: 0.56, xGC: 1.11 })],
  2: [makeSeason({ seasonName: "2025/26", minutes: 3035, totalPoints: 110, xG: 1.0, xA: 1.0, xGI: 2.0, xGC: 40 })],
};

describe("H1: the profile's percentiles use the fixed minutes floor", () => {
  it("a 136-minute cameo is a small sample in Last Completed Season: no percentile, marked on the radar", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const { getByText, getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText(/Small sample — 136 min in this mode, under the 450-minute floor/)).toBeTruthy();
    expect(getAllByText("(small sample)").length).toBe(2); // Defense and Offense radars
    // No tint on any tile.
    expect(asRendered(getByText("xG/Game").closest<HTMLElement>(".stat-tile")!.style.background)).toBe("");
  });

  it("a regular's percentile ignores the cameo: top of a pool of one, not 25th behind a 136-minute sample", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const { getByText } = render(
      <MemoryRouter initialEntries={["/players?player=2"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const tile = getByText("xG/Game").closest<HTMLElement>(".stat-tile")!;
    expect(tile.style.background).toBe(asRendered(percentileTint(100)));
  });

  it("the floor also applies in Current Season: 60 minutes is under one full match", () => {
    setApp([makePlayer({ id: 1, name: "Hinshelwood", position: "MID", teamId: 1, minutes: 60, totalPoints: 5, xGI: 1.43 })]);
    const { getByText, getByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByLabelText("Current Season"));
    expect(getByText(/Small sample — 60 min in this mode, under the 90-minute floor/)).toBeTruthy();
  });

  it("Player Comparison marks the cameo's radar as a small sample", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/player-comparison?players=1,2"]}>
        <PlayerComparison />
      </MemoryRouter>,
    );
    // Only the cameo's radar card, not the regular's.
    expect(getAllByText(/\(small sample\)/).length).toBe(1);
  });

  it("the Team Profile's squad gives a player under the floor no colour, and marks his row", () => {
    const season = clubSeason(101, "2025/26", { players: [clubPlayer(1001, { minutes: 136, totalPoints: 8 }), clubPlayer(1002)] });
    setApp([CAMEO, REGULAR], { clubSeasons: [season] });
    const { getByText } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const cameoRow = getByText("Davies").closest("tr")!;
    expect(cameoRow.getAttribute("title")).toMatch(/^Small sample — 136 min for Arsenal, under 450/);
    const pointsCell = cameoRow.querySelectorAll("td")[1] as HTMLElement;
    expect(pointsCell.style.backgroundColor).toBe("");
  });
});

describe("V2: in the profile, a 0-minute season doesn't count toward Historic Average", () => {
  // 2022/23 on record with 0 minutes (a season out of the Premier League).
  // The window is the last 4 completed seasons, 2022/23–2025/26: without the
  // 0-minute season it's 3 seasons, averaging 120 — and 2021/22 is never
  // pulled in to replace it.
  const seasons = [
    makeSeason({ seasonName: "2021/22", minutes: 3000, totalPoints: 200 }),
    makeSeason({ seasonName: "2022/23", minutes: 0, totalPoints: 0 }),
    makeSeason({ seasonName: "2023/24", minutes: 1800, totalPoints: 90 }),
    makeSeason({ seasonName: "2024/25", minutes: 1800, totalPoints: 120 }),
    makeSeason({ seasonName: "2025/26", minutes: 1800, totalPoints: 150 }),
  ];

  it("Career History averages the 3 played window seasons and marks the 0-minute one †", () => {
    setApp([makePlayer({ id: 1, name: "Ndiaye", position: "MID", teamId: 1 })], { historicProfiles: profiles({ 1: seasons }) });
    setHistory([gw(1)], seasons);
    const { getByText, getByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("Season average (3 seasons)")).toBeTruthy();
    expect(getByText(/^120 pts/)).toBeTruthy();
    fireEvent.click(getByLabelText("Show season-by-season detail"));
    const row = getByText(/^2022\/23/).closest("tr")!;
    expect(row.textContent).toContain("2022/23 †");
    expect(row.getAttribute("title")).toBe("No minutes this season — not counted in the average above");
  });
});

describe("M1: the Team Profile header follows the Data View", () => {
  it("Last Completed Season shows last season's table, not today's", () => {
    const liveTeams = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal", position: 1, points: 15, played: 5, wins: 5 }), TEAMS[1]];
    setApp(state.app.players as NormalizedPlayer[], {
      teams: liveTeams,
      teamsById: new Map(liveTeams.map((t) => [t.id, t])),
      clubSeasons: [clubSeason(101, "2025/26")],
    });
    const { getByText, queryByText } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("4th in table · 70 pts · 38 played · 20W 10D 8L")).toBeTruthy();
    expect(queryByText(/1st in table/)).toBeNull();
  });
});

describe("M2: when the historic dataset fails", () => {
  it("says nothing about the player having no data, and Career History doesn't claim 0 seasons", () => {
    setApp(state.app.players as NormalizedPlayer[], { historicStatus: "error", historicReferenceSeason: null, historicErrorMessage: "502" });
    setHistory([gw(1)], [makeSeason({ seasonName: "2025/26", minutes: 2000, totalPoints: 100 })]);
    const { queryByText, getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(queryByText(/No data for Saliba/)).toBeNull();
    expect(queryByText(/Small sample/)).toBeNull();
    expect(getByText("Season average")).toBeTruthy();
    expect(queryByText(/\(0 seasons\)/)).toBeNull();
  });

  it("once loaded, a player with no data for the mode is told so, and never pointed at the mode already selected", () => {
    // Nothing for 2025/26, but an earlier season in the window.
    setApp(state.app.players as NormalizedPlayer[], { historicProfiles: profiles({ 1: [makeSeason({ seasonName: "2023/24", minutes: 2000, totalPoints: 90 })] }) });
    const { getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const banner = getByText(/No data for Saliba in this mode/);
    expect(banner.textContent).toContain("Try Historic Average or Current Season.");
    expect(banner.textContent).not.toContain("Last Completed Season");
  });
});

describe("Player profile — Live Data details", () => {
  it("M4: Playing Time counts matches — a double gameweek is two", () => {
    setHistory([gw(1), gw(2, { fixtureId: 21 }), gw(2, { fixtureId: 22, minutes: 0 })]);
    const { getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("Matches: 3")).toBeTruthy();
    expect(getByText("Average Minutes Per Match: 60")).toBeTruthy();
  });

  it("L5: Prime's Average row isn't tinted with the Totals row's rank", () => {
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const prime = getAllByText("Totals")[0].closest("table")!;
    const [totalsRow, averageRow] = [...prime.querySelectorAll("tfoot tr")] as HTMLElement[];
    const pointsIndex = 1; // "Totals"/"Average" spans the identity columns, so Points is the next cell
    expect((totalsRow.querySelectorAll("td")[pointsIndex] as HTMLElement).style.background).not.toBe("");
    expect((averageRow.querySelectorAll("td")[pointsIndex] as HTMLElement).style.background).toBe("");
  });

  it("L4: a goalkeeper's Underlying Numbers have no Defensive Contribution tiles", () => {
    setApp([makePlayer({ id: 1, name: "Raya", position: "GKP", teamId: 1, minutes: 450 })]);
    const { queryByText, getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("xGC/Game")).toBeTruthy();
    expect(queryByText("Def. Contrib.")).toBeNull();
    expect(queryByText("DC/Game")).toBeNull();
  });
});

describe("L8: keyboard and screen readers", () => {
  it("the profile is a dialog named after the player, and takes focus when it opens", () => {
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const dialog = getByRole("dialog", { name: "Saliba" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
  });

  it("a squad row opens the player with Enter", () => {
    setApp(state.app.players as NormalizedPlayer[], { clubSeasons: [clubSeason(101, "2025/26", { players: [clubPlayer(1001)] })] });
    const { getByText, getByTestId } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    const row = getByText("Saliba").closest("tr")!;
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(getByTestId("location-search").textContent).toBe("?player=1");
  });

  it("a team pill opens the Team Profile with Enter", () => {
    const { getByRole, getByTestId } = render(
      <MemoryRouter initialEntries={["/"]}>
        <TeamBadge teamId={1} shortName="ARS" />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.keyDown(getByRole("button", { name: "View ARS team profile" }), { key: "Enter" });
    expect(getByTestId("location-search").textContent).toBe("?teamProfile=1");
  });
});

describe("L9: a link to a player or club that doesn't exist", () => {
  it("says the player wasn't found, and × clears the link", () => {
    const { getByText, getByLabelText, getByTestId } = render(
      <MemoryRouter initialEntries={["/players?player=99999"]}>
        <PlayerDetailOverlay />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(getByText("Player not found")).toBeTruthy();
    fireEvent.click(getByLabelText("Close"));
    expect(getByTestId("location-search").textContent).toBe("");
  });

  it("says the club wasn't found", () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=abc"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("Team not found")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Second remediation pass (3-regression.md R-items). Each fails on 29df1c7
// unless noted.
// ---------------------------------------------------------------------------

describe("R1: the Team Profile header's Historic Average results add up to the games played", () => {
  it("shows 15W 10D 13L over 38 played, never 15W 11D 13L (39)", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      clubSeasons: [
        clubSeason(101, "2025/26", { wins: 14, draws: 11, losses: 13, leaguePoints: 53 }),
        clubSeason(101, "2024/25", { wins: 15, draws: 10, losses: 13, leaguePoints: 55 }),
      ],
    });
    const { getByText, getByRole } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByRole("button", { name: "Historic Average" }));
    expect(getByText("4th in table · 54 pts · 38 played · 15W 10D 13L")).toBeTruthy();
  });
});

describe("R4: a player the server couldn't build isn't told he has no data", () => {
  it("the profile says his historic figures couldn't be fetched, not 'No data'", () => {
    setApp(state.app.players as NormalizedPlayer[], { historicSkippedPlayerIds: [1] });
    const { queryByText, getByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(queryByText(/No data for Saliba/)).toBeNull();
    expect(getByText(/historic figures couldn't be fetched from FPL this session/)).toBeTruthy();
  });

  it("Player Comparison doesn't list him as having no data — nor anyone while the historic data is loading", () => {
    const players = [
      makePlayer({ id: 1, name: "Saliba", position: "DEF", teamId: 1, minutes: 450 }),
      makePlayer({ id: 2, name: "Gabriel", position: "DEF", teamId: 1, minutes: 450 }),
    ];
    setApp(players, { historicSkippedPlayerIds: [1], historicProfiles: profiles({ 2: [makeSeason({ seasonName: "2025/26", minutes: 3000, totalPoints: 150 })] }) });
    const first = render(
      <MemoryRouter initialEntries={["/player-comparison?players=1,2"]}>
        <PlayerComparison />
      </MemoryRouter>,
    );
    expect(first.queryByText(/has no data in this mode/)).toBeNull();
    cleanup();
    setApp(players, { historicStatus: "loading" });
    const loading = render(
      <MemoryRouter initialEntries={["/player-comparison?players=1,2"]}>
        <PlayerComparison />
      </MemoryRouter>,
    );
    expect(loading.queryByText(/no data in this mode/)).toBeNull();
  });
});

describe("T2: the no-data message only suggests Data Views where he actually played", () => {
  it("doesn't suggest Last Completed Season when all he has there is 0 minutes", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      historicProfiles: profiles({ 1: [makeSeason({ seasonName: "2024/25", minutes: 0, totalPoints: 0 }), makeSeason({ seasonName: "2025/26", minutes: 0, totalPoints: 0 })] }),
    });
    const { getByText, getByRole } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByRole("button", { name: "Historic Average" }));
    const banner = getByText(/No data for Saliba in this mode/);
    expect(banner.textContent).toContain("Try Current Season.");
    expect(banner.textContent).not.toContain("Last Completed Season");
  });
});

describe("R5 (not a defect — guards the right behaviour): keyboard focus through club → player → close", () => {
  it("returns to the team pill that opened the club", () => {
    setApp(state.app.players as NormalizedPlayer[], { clubSeasons: [clubSeason(101, "2025/26", { players: [clubPlayer(1001)] })] });
    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={["/players"]}>
        <TeamBadge teamId={1} shortName="ARS" />
        <PlayerDetailOverlay />
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const pill = getByRole("button", { name: "View ARS team profile" });
    pill.focus();
    fireEvent.keyDown(pill, { key: " " }); // Space as well as Enter
    const row = getByText("Saliba").closest("tr")!;
    row.focus();
    fireEvent.keyDown(row, { key: " " });
    expect(getByRole("dialog", { name: "Saliba" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(pill);
  });
});
