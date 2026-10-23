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
import type { ClubMatch, ClubSeason, NormalizedPlayer, PlayerGameweekHistory, PlayerSeasonHistory } from "../types/normalized";

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
    historicFetchSkippedPlayerIds: [],
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
  it("H2: pre-season, the current season's Points History bar shows 0 points, not last season's carried-over total", () => {
    const carried = makePlayer({ id: 1, name: "Gabriel", position: "DEF", teamId: 1, totalPoints: 209, minutes: 2750, goals: 4 });
    setApp([carried], { currentSeasonHasStarted: false });
    setHistory([], [makeSeason({ seasonName: "2025/26", totalPoints: 209, minutes: 2750, goals: 4 })]);
    const { getByLabelText, getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByLabelText(/^2026\/27 \(current season\): 0 pts/)).toBeTruthy();
    expect(getAllByText(/2026\/27 \(current season\)/).length).toBeGreaterThan(0);
  });
});

describe("Player profile — while historic data is still loading", () => {
  // M2: the profile opens on Last Completed Season, which needs the historic
  // dataset. Until it arrives the player has not been shown to have no data.
  it("M2: does not tell the user the player has no data while the historic dataset is loading", () => {
    setApp(state.app.players as NormalizedPlayer[], { historicStatus: "loading", historicReferenceSeason: null });
    const { queryByText, queryByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(queryByText(/No data for Saliba in this mode/)).toBeNull();
    expect(queryByLabelText(/^Small sample/)).toBeNull();
  });
});

describe("Player profile — gameweek log", () => {
  // L1: whole-number counts show as whole numbers (the rest of the app shows
  // minutes as "90", not "90.00").
  it("L1: Live Data shows 90 minutes as '90', not '90.00'", () => {
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
    // 5 gameweeks × 6 points, shown in the Totals row; average 6.0.
    expect(getAllByText("Totals").length).toBe(1);
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

function clubMatch(fixture: number, event: number, overrides: Partial<ClubMatch> = {}): ClubMatch {
  return { fixture, event, opponentCode: 102, home: true, goalsFor: 2, goalsAgainst: 0, fantasyPoints: 60, goals: 2, assists: 2, bonus: 3, xG: 1.8, xA: 1.2, xGI: 3, xGC: 0.7, dc: 80, ...overrides };
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
    matches: [],
    ...overrides,
  };
}

// A reserve full-back (Ben Davies in the audit: 136 minutes, 0.49 xG) and a
// regular (3,035 minutes, 1.0 xG) — the cameo's xG/Game is far higher.
const CAMEO = makePlayer({ id: 1, name: "Davies", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
const REGULAR = makePlayer({ id: 2, name: "Konsa", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
// A second regular with less xG: a comparison needs two (<comparative_colouring>).
const REGULAR_2 = makePlayer({ id: 3, name: "Mings", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
const LAST_SEASON = {
  1: [makeSeason({ seasonName: "2025/26", minutes: 136, totalPoints: 8, xG: 0.49, xA: 0.07, xGI: 0.56, xGC: 1.11 })],
  2: [makeSeason({ seasonName: "2025/26", minutes: 3035, totalPoints: 110, xG: 1.0, xA: 1.0, xGI: 2.0, xGC: 40 })],
  3: [makeSeason({ seasonName: "2025/26", minutes: 3000, totalPoints: 90, xG: 0.5, xA: 0.5, xGI: 1.0, xGC: 45 })],
};

describe("H1: the profile's percentiles use the fixed minutes floor", () => {
  it("a 136-minute cameo is a small sample in Last Completed Season: no percentile, marked on the radar", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const { getByText, getAllByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    // No banner: the amber stopwatch on each card left uncoloured for it — both radars (Defense and Offense), Underlying Numbers and Value — explains on hover (<minutes_marker>).
    const badges = getAllByLabelText(/^Small sample: 136 min in this mode, under the 450-minute floor/);
    expect(badges.length).toBe(4);
    expect(badges.map((b) => b.closest(".card-title")!.textContent)).toEqual(["Percentile Radar · Defense", "Percentile Radar · Offense", "Underlying Numbers", "Value"]);
    for (const b of badges) expect(b.getAttribute("title")).toBe(b.getAttribute("aria-label"));
    // No tint on any tile.
    expect(asRendered(getByText("xG/Game").closest<HTMLElement>(".stat-tile")!.style.background)).toBe("");
  });

  it("a regular's percentile ignores the cameo: top of the two regulars (75th), not level with the middle behind a 136-minute sample", () => {
    setApp([CAMEO, REGULAR, REGULAR_2], { historicProfiles: profiles(LAST_SEASON) });
    const { getByText } = render(
      <MemoryRouter initialEntries={["/players?player=2"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const tile = getByText("xG/Game").closest<HTMLElement>(".stat-tile")!;
    // Among the two regulars, the higher is (1 + ½) ÷ 2 = 75th; counting the cameo it would be the 50th (no colour).
    expect(tile.style.background).toBe(asRendered(percentileTint(75)));
  });

  it("a player alone in his comparison pool has no colour: there's nobody to compare him with", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const { getByText } = render(
      <MemoryRouter initialEntries={["/players?player=2"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByText("xG/Game").closest<HTMLElement>(".stat-tile")!.style.background).toBe("");
  });

  it("the floor also applies in Current Season: 60 minutes is under one full match", () => {
    setApp([makePlayer({ id: 1, name: "Hinshelwood", position: "MID", teamId: 1, minutes: 60, totalPoints: 5, xGI: 1.43 })]);
    const { getAllByLabelText, getByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByLabelText("Current Season"));
    expect(getAllByLabelText(/^Small sample: 60 min in this mode, under the 90-minute floor/).length).toBeGreaterThan(0);
  });

  it("Player Comparison marks the cameo as a small sample on its radars and Outputs", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    localStorage.setItem("fpl-dashboard:comparison:selected-view:v1", JSON.stringify({ version: 1, data: "comparison-starter" }));
    const { getAllByLabelText } = render(
      <MemoryRouter initialEntries={["/player-comparison?players=1,2"]}>
        <PlayerComparison />
      </MemoryRouter>,
    );
    // Starter's two Last Completed Season radars (their legends) and its Last
    // Season Output panel (its key) — never the regular's.
    const marks = getAllByLabelText(/^Small sample: 136 min/);
    expect(marks.length).toBe(3);
    for (const m of marks) expect(m.closest(".cmp-legend-item")!.textContent).toContain("Davies");
  });

});

describe("In the profile, only seasons of 450+ minutes count toward Historic Average (V2, then the owner's 450 rule)", () => {
  // 2022/23 on record with 0 minutes (a season out of the Premier League) and
  // 2024/25 a 300-minute cameo season. The window is the last 4 completed
  // seasons, 2022/23–2025/26: only 2023/24 and 2025/26 reach 450, averaging
  // 120 — and 2021/22 is never pulled in to replace the others.
  const seasons = [
    makeSeason({ seasonName: "2021/22", minutes: 3000, totalPoints: 200 }),
    makeSeason({ seasonName: "2022/23", minutes: 0, totalPoints: 0 }),
    makeSeason({ seasonName: "2023/24", minutes: 1800, totalPoints: 90 }),
    makeSeason({ seasonName: "2024/25", minutes: 300, totalPoints: 20 }),
    makeSeason({ seasonName: "2025/26", minutes: 1800, totalPoints: 150 }),
  ];

  it("Points History averages the 2 window seasons that reach 450 and marks the 0- and 300-minute ones with the amber small-sample stopwatch (<minutes_marker>)", () => {
    setApp([makePlayer({ id: 1, name: "Ndiaye", position: "MID", teamId: 1 })], { historicProfiles: profiles({ 1: seasons }) });
    setHistory([gw(1)], seasons);
    const { getByLabelText, queryByLabelText, container } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getByLabelText("Season average over 2 seasons: 120 pts")).toBeTruthy();
    const note = "Under 450 minutes this season: a small sample, not counted in the season average";
    // The chart: the amber stopwatch beside each under-floor season's label, and the reason on hover — never "†", which is for a season outside the window.
    expect(container.querySelectorAll(".points-history-axis .small-sample-mark")).toHaveLength(2);
    expect(getByLabelText(`2024/25 (${note}): 20 pts. Show its matches below`)).toBeTruthy();
    expect(getByLabelText(`2022/23 (${note}): 0 pts. Show its matches below`)).toBeTruthy();
    // A counted season has no marker. (The season-by-season table is gone — the Match Log has its figures.)
    expect(getByLabelText(/^2023\/24: 90 pts\. Show its matches below/)).toBeTruthy();
    expect(queryByLabelText("Show season-by-season detail")).toBeNull();
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
  it("says nothing about the player having no data, and Points History doesn't claim 0 seasons", () => {
    setApp(state.app.players as NormalizedPlayer[], { historicStatus: "error", historicReferenceSeason: null, historicErrorMessage: "502" });
    setHistory([gw(1)], [makeSeason({ seasonName: "2025/26", minutes: 2000, totalPoints: 100 })]);
    const { queryByText, getByLabelText, queryByLabelText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(queryByText(/No data for Saliba/)).toBeNull();
    expect(queryByLabelText(/^Small sample/)).toBeNull();
    expect(getByLabelText("Season average")).toBeTruthy();
    expect(queryByLabelText(/0 seasons/)).toBeNull();
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

  it("L5: the Average row ranks the per-match figure, not the Totals row's rank", () => {
    // Saliba joined late: 5 matches in his log (6 pts each, 30 total) while
    // Arsenal have played 20. Rice has 100 over Chelsea's 20 matches (5.0 a
    // match). Saliba's total is the lower (red); his 6.0 a match the higher (green).
    const finished = (id: number, home: number, away: number) =>
      ({ id, eventId: id, homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0, kickoffTime: null, finished: true, homeDifficulty: 3, awayDifficulty: 3 });
    setApp(
      [
        makePlayer({ id: 1, name: "Saliba", position: "DEF", teamId: 1, teamName: "Arsenal", totalPoints: 30, minutes: 450 }),
        makePlayer({ id: 2, name: "Rice", position: "DEF", teamId: 2, teamName: "Chelsea", totalPoints: 100, minutes: 1800 }),
      ],
      { fixtures: Array.from({ length: 20 }, (_, i) => finished(i + 1, 1, 2)) },
    );
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const table = getAllByText("Totals")[0].closest("table")!;
    const [totalsRow, averageRow] = [...table.querySelectorAll("tfoot tr")] as HTMLElement[];
    const pointsIndex = 1; // "Totals"/"Average" spans the identity columns, so Points is the next cell
    const totalsCell = totalsRow.querySelectorAll("td")[pointsIndex] as HTMLElement;
    const averageCell = averageRow.querySelectorAll("td")[pointsIndex] as HTMLElement;
    expect(averageCell.textContent).toBe("6.0");
    expect(totalsCell.style.background).toBe(asRendered(percentileTint(25)));
    expect(averageCell.style.background).toBe(asRendered(percentileTint(75)));
  });

  it("the Average row has no colour with no one to compare against (no finished fixtures)", () => {
    const { getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    const averageRow = getAllByText("Average")[0].closest("tr")!;
    expect((averageRow.querySelectorAll("td")[1] as HTMLElement).style.background).toBe("");
  });

  it("Live Data is one table — no Supplements", () => {
    const { queryByText, getAllByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    expect(getAllByText("Totals")).toHaveLength(1);
    expect(queryByText("Supplements")).toBeNull();
    expect(queryByText("Prime")).toBeNull();
    expect(queryByText("Tackles")).toBeNull();
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
    // League points are a count, so a Historic Average shows 1 decimal (<averaged_counts>); W/D/L stay whole and add up to 38.
    expect(getByText("4th in table · 54.0 pts · 38 played · 15W 10D 13L")).toBeTruthy();
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

describe("R5 (not a defect — guards the right behaviour): keyboard focus through club → close", () => {
  it("returns to the team pill that opened the club", () => {
    setApp(state.app.players as NormalizedPlayer[], { clubSeasons: [clubSeason(101, "2025/26")] });
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/players"]}>
        <TeamBadge teamId={1} shortName="ARS" />
        <PlayerDetailOverlay />
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const pill = getByRole("button", { name: "View ARS team profile" });
    pill.focus();
    fireEvent.keyDown(pill, { key: " " }); // Space as well as Enter
    expect(getByRole("dialog", { name: "Arsenal" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(pill);
  });
});

// ---------------------------------------------------------------------------
// The owner's follow-up (2026-09-25): where the user can't set minimum
// minutes, Historic Average counts only seasons of 450+ minutes; Player
// Comparison's table treats a small sample as its radars do.
// ---------------------------------------------------------------------------

describe("Historic Average counts only 450+ minute seasons in the fixed-floor sections", () => {
  it("the profile calls a player who played but never reached 450 in a season a small sample, not 'no data'", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      historicProfiles: profiles({ 1: [makeSeason({ seasonName: "2024/25", minutes: 300, totalPoints: 12 }), makeSeason({ seasonName: "2025/26", minutes: 400, totalPoints: 15 })] }),
    });
    const { getByRole, getAllByLabelText, queryByText } = render(
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>,
    );
    fireEvent.click(getByRole("button", { name: "Historic Average" }));
    expect(getAllByLabelText(/^Small sample. No season in the last 4 with 450\+ minutes/).length).toBeGreaterThan(0);
    expect(queryByText(/No data for Saliba/)).toBeNull();
  });

});

describe("Player Comparison's Outputs treat a small sample as its radars do", () => {
  const OTHER = makePlayer({ id: 3, name: "Mings", position: "DEF", teamId: 1, teamName: "Arsenal", minutes: 0, totalPoints: 0 });
  const SEASONS = { ...LAST_SEASON, 3: [makeSeason({ seasonName: "2025/26", minutes: 2500, totalPoints: 90, xG: 0.5, xA: 0.5, xGI: 1.0, xGC: 35 })] };

  /** The Starter view's Last Season Output panel's xG/Game row. */
  function xgPerGameRow(ids: string): HTMLElement {
    localStorage.setItem("fpl-dashboard:comparison:selected-view:v1", JSON.stringify({ version: 1, data: "comparison-starter" }));
    const { getByText } = render(
      <MemoryRouter initialEntries={[`/player-comparison?players=${ids}`]}>
        <PlayerComparison />
      </MemoryRouter>,
    );
    const panel = getByText("Last Season Output").closest(".card")!;
    const label = [...panel.querySelectorAll(".cmp-outputs-label")].find((el) => el.textContent === "xG/Game")!;
    return label.closest(".cmp-outputs-row") as HTMLElement;
  }

  it("no colour or bold for the cameo, and the others are ranked among themselves", () => {
    setApp([CAMEO, REGULAR, OTHER], { historicProfiles: profiles(SEASONS) });
    const cells = [...xgPerGameRow("1,2,3").querySelectorAll<HTMLElement>(".cmp-outputs-value")];
    // Davies 0.25 would top this row; he's greyed instead, and Konsa (0.03) vs Mings (0.02) decide the bold.
    expect(cells.map((c) => c.textContent)).toEqual(["0.25 ▸", "0.03", "0.02"]);
    expect(cells[0].style.color).toBe("var(--text-muted)");
    expect(cells[0].style.fontWeight).toBe("");
    expect(cells[1].style.fontWeight).toBe("700");
    expect(cells[2].style.fontWeight).toBe("");
  });

  it("the cameo's marker is hollow and doesn't set the scale or tint the bar; the regulars' do", () => {
    setApp([CAMEO, REGULAR, OTHER], { historicProfiles: profiles(SEASONS) });
    const row = xgPerGameRow("1,2,3");
    const markers = [...row.querySelectorAll(".cmp-outputs-marker:not(.small-sample)")].map((m) => m.getAttribute("title") ?? "");
    expect(markers).toHaveLength(2);
    expect(markers.some((t) => t.startsWith("Davies"))).toBe(false);
    // Davies's 0.25 is past Konsa's 0.03, the leader: pinned to the end, flagged with ▸.
    const cameo = row.querySelector<HTMLElement>(".cmp-outputs-marker.small-sample")!;
    expect(cameo.getAttribute("title")).toMatch(/^Davies: 0\.25 .*past the end of this scale/);
    expect(cameo.style.left).toBe("100%");
    expect(row.querySelectorAll(".cmp-outputs-value")[0].textContent).toBe("0.25 ▸");
    // The bar: shared to Mings's 0.02, then Konsa's lead in Konsa's colour.
    expect(row.querySelectorAll(".cmp-outputs-fill")).toHaveLength(2);
  });

  it("with one regular left, nothing is bold: there's no one to beat", () => {
    setApp([CAMEO, REGULAR], { historicProfiles: profiles(LAST_SEASON) });
    const cells = [...xgPerGameRow("1,2").querySelectorAll<HTMLElement>(".cmp-outputs-value")];
    expect(cells.map((c) => c.style.fontWeight)).toEqual(["", ""]);
  });
});

// ---------------------------------------------------------------------------
// The owner's rule (2026-09-26): team figures and player figures are kept
// apart. The Team Profile shows only club figures — its squad table is gone,
// replaced by the club's own live-season match log (<club_match_log>).
// ---------------------------------------------------------------------------

describe("The Team Profile shows club figures only", () => {
  const LIVE = "2026/27";
  const matches = [
    clubMatch(1, 1, { goalsFor: 2, goalsAgainst: 0, xG: 1.8, xGC: 0.7 }),
    clubMatch(2, 2, { opponentCode: 102, home: false, goalsFor: 1, goalsAgainst: 3, fantasyPoints: 20, goals: 1, xG: 0.9, xGC: 2.4 }),
  ];

  function renderClub() {
    setApp(state.app.players as NormalizedPlayer[], {
      clubSeasons: [clubSeason(101, "2025/26"), clubSeason(101, LIVE, { complete: false, played: 2, matches }), clubSeason(102, LIVE, { complete: false, played: 2 })],
    });
    return render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
  }

  it("has no squad table, no player names and no link to players", () => {
    const { queryByText, queryByRole } = renderClub();
    expect(queryByText("Squad")).toBeNull();
    expect(queryByText("Saliba")).toBeNull();
    expect(queryByText("Player Rankings")).toBeNull();
    expect(queryByRole("link")).toBeNull();
  });

  it("a club with no matches in the view says so and suggests the views it played in, as the player profile does (audit 2026-10-23 in-app)", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      clubSeasons: [clubSeason(101, "2025/26"), clubSeason(101, LIVE, { complete: false, played: 2, matches }), clubSeason(102, LIVE, { complete: false, played: 2 })],
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=2"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const note = container.querySelector(".banner.info")?.textContent ?? "";
    expect(note).toMatch(/^No matches for .+ in this mode, so every figure below shows —\. Try Current Season\./);
    cleanup();
    const arsenal = renderClub();
    expect(arsenal.container.querySelector(".banner.info")).toBeNull();
  });

  it("has no minimum-minutes badge: no floor applies to club figures", () => {
    const { queryByLabelText } = renderClub();
    expect(queryByLabelText(/^Minimum minutes applied/)).toBeNull();
  });

  it("logs the club's live-season matches, most recent first, with Totals and Average rows", () => {
    const { getByRole } = renderClub();
    const table = getByRole("table", { name: "Arsenal match log" });
    const rows = [...table.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
    // GW, Opponent, Result, FPL Points, Goals, Assists, xG, xA, xGI, Clean Sheets, xGC, DC
    expect(rows).toEqual([
      ["2", "CHE (A)", "1–3", "20", "1", "2", "0.90", "1.20", "3.00", "0", "2.40", "80"],
      ["1", "CHE (H)", "2–0", "60", "2", "2", "1.80", "1.20", "3.00", "1", "0.70", "80"],
    ]);
    const [totals, average] = [...table.querySelectorAll("tfoot tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
    expect(totals).toEqual(["Totals", "80", "3", "4", "2.70", "2.40", "6.00", "1", "3.10", "160"]);
    expect(average).toEqual(["Average", "40.0", "1.50", "2.00", "1.35", "1.20", "3.00", "0.50", "1.55", "80.0"]);
  });

  it("the match log is always the live season, whatever the Data View", () => {
    const { getByRole } = renderClub();
    fireEvent.click(getByRole("button", { name: "Historic Average" }));
    expect(getByRole("table", { name: "Arsenal match log" }).querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("adds up the matches that have a figure when one lacks it, and says so on hover (<partial_totals>)", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      clubSeasons: [clubSeason(101, "2025/26"), clubSeason(101, LIVE, { complete: false, matches: [clubMatch(1, 1), clubMatch(2, 2, { dc: null })] })],
    });
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const [totals, average] = getByRole("table", { name: "Arsenal match log" }).querySelectorAll("tfoot tr");
    const totalDc = [...totals.querySelectorAll("td")].at(-1)!;
    const averageDc = [...average.querySelectorAll("td")].at(-1)!;
    // The one match with a figure (80), never "—" for the whole column and never the missing match as 0 (which would average 40).
    expect(totalDc.textContent).toBe("80");
    expect(averageDc.textContent).toBe("80.0");
    expect(totalDc.querySelector("span")!.getAttribute("title")).toBe("From the 1 of 2 matches that have a figure");
    expect(averageDc.querySelector("span")!.getAttribute("title")).toBe("From the 1 of 2 matches that have a figure");
    // A column every match has: no hover note.
    expect([...totals.querySelectorAll("td")][1].querySelector("span")).toBeNull();
  });

  it("shows — for a column none of the matches has a figure for", () => {
    setApp(state.app.players as NormalizedPlayer[], {
      clubSeasons: [clubSeason(101, "2025/26"), clubSeason(101, LIVE, { complete: false, matches: [clubMatch(1, 1, { dc: null }), clubMatch(2, 2, { dc: null })] })],
    });
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
        <TeamDetailOverlay />
      </MemoryRouter>,
    );
    const totals = getByRole("table", { name: "Arsenal match log" }).querySelector("tfoot tr")!;
    expect([...totals.querySelectorAll("td")].at(-1)!.textContent).toBe("—");
  });
});
