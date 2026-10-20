import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerDetailOverlay } from "./PlayerDetailOverlay";
import { TeamDetailOverlay } from "./TeamDetailOverlay";
import { ExternalStatsContext, type ExternalStatsSource } from "../extensions/externalStats";
import { makePlayer, makeTeam, makeSeason } from "../test/fixtures";
import type { ClubMatch, ClubSeason, NormalizedPlayer, PlayerGameweekHistory, PlayerPastMatch, PlayerSeasonHistory, PlayerSeasonPeer } from "../types/normalized";
import { percentileTint } from "../utils/colorScale";

// The profiles' Match Log follows the season picked on Points History
// (<match_log_follows_season>, <club_match_log>), and a second source adds
// its own columns and Views through the extension slot.

const TEAMS = [makeTeam({ id: 1, code: 3, shortName: "ARS", name: "Arsenal" }), makeTeam({ id: 2, code: 8, shortName: "CHE", name: "Chelsea" })];

const state = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  history: {} as Record<string, unknown>,
  pastSeasons: {} as Record<string, PlayerPastMatch[]>,
  pastPeers: {} as Record<string, PlayerSeasonPeer[]>,
  pastRequests: 0,
}));

vi.mock("../state/AppStateContext", () => ({ useAppState: () => state.app }));
vi.mock("../state/usePlayerHistory", () => ({ usePlayerHistory: () => state.history }));
vi.mock("../api/client", () => ({
  fetchPlayerSeasons: async () => {
    state.pastRequests += 1;
    return { data: { seasons: state.pastSeasons, peers: state.pastPeers }, source: "cache", fetchedAt: 0 };
  },
}));

function gw(round: number, overrides: Partial<PlayerGameweekHistory> = {}): PlayerGameweekHistory {
  return {
    fixtureId: 100 + round, round, minutes: 90, starts: 1, totalPoints: 6, wasHome: true, opponentTeamId: 2, teamScore: 1, opponentScore: 0, goals: 0, assists: 0,
    cleanSheets: 1, goalsConceded: 0, ownGoals: 0, penaltiesSaved: 0, penaltiesMissed: 0, yellowCards: 0, redCards: 0, saves: 0, bonus: 0, bps: 20,
    defensiveContribution: 10, tackles: 2, clearancesBlocksInterceptions: 5, recoveries: 3, xG: 0.1, xA: 0.1, xGI: 0.2, xGC: 0.8, ...overrides,
  };
}

function past(fixture: number, overrides: Partial<PlayerPastMatch> = {}): PlayerPastMatch {
  return {
    fixture, round: fixture, opponentCode: 90, opponentShortName: "BUR", home: true, teamScore: 2, opponentScore: 0, minutes: 90, starts: 1, totalPoints: 8,
    goals: 1, assists: 0, cleanSheets: 1, goalsConceded: 0, saves: 0, bonus: 2, bps: 30, xG: null, xA: null, xGI: null, xGC: null, dc: null, ...overrides,
  };
}

function setApp(players: NormalizedPlayer[], overrides: Record<string, unknown> = {}) {
  state.app = {
    players, teams: TEAMS, teamsById: new Map(TEAMS.map((t) => [t.id, t])), fixtures: [], clubSeasons: [], historicReferenceSeason: "2025/26",
    historicStatus: "ready", historicErrorMessage: null, historicSkippedPlayerIds: [], historicFetchSkippedPlayerIds: [], historicRefreshing: false,
    refreshHistoricData: () => {}, historicProfiles: new Map(), allTimeSeasonsByPlayerId: new Map(), currentSeasonHasStarted: true, requestHistoricData: () => {},
    ...overrides,
  };
}

function setHistory(history: PlayerGameweekHistory[], seasonHistory: PlayerSeasonHistory[] = []) {
  state.history = { status: "ready", history, seasonHistory, errorMessage: null, retry: () => {} };
}

/** A stand-in second source: one position per fixture, and its own Views card. */
function fakeSource(): ExternalStatsSource {
  const noColumns = { groups: [], alternates: {} };
  return {
    id: "understat", label: "Understat", className: "col-source-understat", icon: null, status: "ready", staleNote: null, request: () => {},
    playerColumns: () => noColumns, teamColumns: () => noColumns, playerTrends: { groups: [], alternates: {} },
    guideSection: { id: "understat", navLabel: "Understat", title: "Understat", accentVar: "--col-understat", body: null },
    profiles: {
      requestPlayer: () => {},
      requestClub: () => {},
      playerMatchColumns: (_code, season) => [{ key: "us-position", header: "Position", cell: (fixture) => `${season}:${fixture}` }],
      clubMatchColumns: () => [{ key: "us-win", header: "Win Chance", cell: (fixture) => `w${fixture}`, total: "1.5", average: "50%" }],
      playerMatchAlternates: () => ({ xg: { key: "xg", header: "xG", cell: (fixture) => `us-xg-${fixture}`, total: "9.99", average: "4.99" } }),
      clubMatchAlternates: () => ({ xgc: { key: "xgc", header: "xGC", cell: (fixture) => `us-xgc-${fixture}`, total: "7.77", average: "3.88" } }),
      playerCards: (_code, view) => <div className="card">Shot card for {(view.seasons ?? []).join(", ")}</div>,
      clubCards: (_code, view) => <div className="card">Club card for {(view.seasons ?? []).join(", ")}</div>,
    },
  };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  state.pastRequests = 0;
  state.pastPeers = {};
  state.pastSeasons = { "2024/25": [past(1), past(2, { minutes: 0, goals: 0, totalPoints: 0, cleanSheets: 0, opponentShortName: "LEI", home: false, teamScore: 0, opponentScore: 1 })] };
  setApp([makePlayer({ id: 1, code: 500, name: "Saliba", position: "DEF", teamId: 1, teamName: "Arsenal", totalPoints: 30, minutes: 450 })]);
  setHistory([gw(1), gw(2)], [makeSeason({ seasonName: "2024/25", totalPoints: 150, minutes: 3000 }), makeSeason({ seasonName: "2025/26", totalPoints: 170, minutes: 3100 })]);
});

afterEach(cleanup);

function renderPlayer(source: ExternalStatsSource | null = null) {
  return render(
    <ExternalStatsContext.Provider value={source}>
      <MemoryRouter initialEntries={["/players?player=1"]}>
        <PlayerDetailOverlay />
      </MemoryRouter>
    </ExternalStatsContext.Provider>,
  );
}

const matchLog = (container: HTMLElement) => container.querySelector<HTMLTableElement>('table[aria-label="Saliba match log"]')!;

describe("Player profile — Match Log", () => {
  it("opens on the live season, headed as FPL's, without fetching past seasons", () => {
    const { getByText, container } = renderPlayer();
    const heading = getByText("FPL · Match Log").closest(".profile-section-heading")!;
    expect(heading.classList.contains("col-source-fpl")).toBe(true);
    expect(within(heading as HTMLElement).getByText("2026/27 (current season)")).toBeTruthy();
    expect(matchLog(container).querySelectorAll("tbody tr")).toHaveLength(2);
    expect(state.pastRequests).toBe(0);
  });

  it("shows a past season's matches once its Points History bar is picked, and goes back on the live bar", async () => {
    const { getByRole, container, getByText } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    expect(getByText("2024/25", { selector: ".match-log-season" })).toBeTruthy();
    const rows = [...matchLog(container).querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(rows[0]).toContain("LEI (A)");
    expect(rows[1]).toContain("BUR (H)");
    // xG wasn't recorded that season for a match he played: the total is "—", never a part-sum.
    const totals = [...matchLog(container).querySelectorAll("tfoot tr")[0].querySelectorAll("td")].map((td) => td.textContent);
    const headers = [...matchLog(container).querySelectorAll("thead th")].map((th) => th.textContent);
    expect(totals[headers.indexOf("Points") - 2]).toBe("8");
    expect(totals[headers.indexOf("xG") - 2]).toBe("—");
    fireEvent.click(getByRole("button", { name: /^2026\/27 \(current season\)/ }));
    expect(getByText("2026/27 (current season)", { selector: ".match-log-season" })).toBeTruthy();
  });

  it("carries what the old Points History table had: the season's price in the heading, and a Starts column with its total", async () => {
    setHistory([gw(1), gw(2)], [makeSeason({ seasonName: "2024/25", totalPoints: 150, minutes: 3000, startCost: 5.5, endCost: 6.0 }), makeSeason({ seasonName: "2025/26", totalPoints: 170, minutes: 3100 })]);
    state.pastSeasons = { "2024/25": [past(1, { starts: 1 }), past(2, { minutes: 0, starts: 0 })] };
    const { getByRole, getByLabelText, container } = renderPlayer();
    // Current season: today's price.
    expect(getByLabelText(/^Price today: £/)).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    expect(getByLabelText("Price at the start and end of the season: £5.5m → £6.0m")).toBeTruthy();
    const headers = [...matchLog(container).querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toContain("Starts");
    const totals = [...matchLog(container).querySelectorAll("tfoot tr")[0].querySelectorAll("td")].map((td) => td.textContent);
    expect(totals[headers.indexOf("Starts") - 2]).toBe("1");
  });

  it("a season with no match-by-match record (before 2016/17) shows FPL's season totals instead", async () => {
    setHistory([gw(1)], [makeSeason({ seasonName: "2014/15", totalPoints: 99, minutes: 2500, goals: 7 }), makeSeason({ seasonName: "2025/26", totalPoints: 170, minutes: 3100 })]);
    state.pastSeasons = {};
    const { getByRole, findByRole } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2014\/15/ }));
    const table = await findByRole("table", { name: "2014/15 season totals" });
    const headers = [...table.querySelectorAll("th")].map((th) => th.textContent);
    const cells = [...table.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells[headers.indexOf("Points")]).toBe("99");
    expect(cells[headers.indexOf("Minutes")]).toBe("2,500");
    expect(cells[headers.indexOf("Goals")]).toBe("7");
  });

  it("adds up the matches that have a figure when a match he played lacks one, and says so on hover (<partial_totals>)", async () => {
    // Match 1 has xG 0.5; match 3 he played without a figure (left out); match 2 he didn't play (a provable 0).
    state.pastSeasons = { "2024/25": [past(1, { xG: 0.5 }), past(2, { minutes: 0, goals: 0, totalPoints: 0, cleanSheets: 0 }), past(3)] };
    const { getByRole, container } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    const headers = [...matchLog(container).querySelectorAll("thead th")].map((th) => th.textContent);
    const [totalsRow, averageRow] = matchLog(container).querySelectorAll("tfoot tr");
    const totalXg = totalsRow.querySelectorAll("td")[headers.indexOf("xG") - 2];
    const averageXg = averageRow.querySelectorAll("td")[headers.indexOf("xG") - 2];
    expect(totalXg.textContent).toBe("0.50");
    // Over the 2 matches with a figure, never all 3 (0.17) and never "—".
    expect(averageXg.textContent).toBe("0.25");
    expect(totalXg.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches that have a figure");
    expect(averageXg.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches that have a figure");
    // Points: every match has one, so no hover note.
    const totalPts = totalsRow.querySelectorAll("td")[headers.indexOf("Points") - 2];
    expect(totalPts.textContent).toBe("16");
    expect(totalPts.querySelector("span")).toBeNull();
  });

  it("colours a past season's Totals and Average against his position that season, at the fixed floor", async () => {
    // Six full matches: 540 minutes, 8 points each (48), 6 goals.
    state.pastSeasons = { "2024/25": Array.from({ length: 6 }, (_, i) => past(i + 1, { totalPoints: 8, goals: 1 })) };
    const peer = (minutes: number, matches: number, totalPoints: number, xGC: number): PlayerSeasonPeer => ({ minutes, matches, totals: { minutes, matches, totalPoints, goals: 0, xGC } });
    // Two peers above the floor, both scoring less, and one under it (ignored, or he wouldn't top the pool).
    state.pastPeers = { "2024/25": [peer(900, 10, 20, 5), peer(900, 10, 30, 15), peer(100, 2, 999, 0)] };
    const { getByRole, container } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    const log = matchLog(container);
    const headers = [...log.querySelectorAll("thead th")].map((th) => th.textContent);
    const cell = (row: number, name: string) => log.querySelectorAll("tfoot tr")[row].querySelectorAll("td")[headers.indexOf(name) - 2] as HTMLElement;
    // Totals: 48 points tops 20 and 30 — (2 below + half of his own tie) of 3.
    // (The browser rewrites colours with its own spacing.)
    const bare = (c: string | undefined) => (c ?? "").replace(/\s/g, "");
    const top = bare(percentileTint(((2 + 0.5) / 3) * 100));
    expect(top).not.toBe("");
    expect(bare(cell(0, "Points").style.background)).toBe(top);
    // Average: 8 a match against 2 and 3 a match (each their total ÷ their matches).
    expect(bare(cell(1, "Points").style.background)).toBe(top);
    // xG wasn't recorded that season: no figure, so no colour.
    expect(cell(0, "xG").style.background).toBe("");
  });

  it("leaves a past season under the fixed floor uncoloured, a small sample", async () => {
    state.pastPeers = { "2024/25": [{ minutes: 900, matches: 10, totals: { minutes: 900, matches: 10, totalPoints: 1, goals: 0 } }] };
    const { getByRole, container } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    const tds = [...matchLog(container).querySelectorAll("tfoot td")] as HTMLElement[];
    expect(tds.every((td) => td.style.background === "")).toBe(true);
  });

  it("says when a picked season is before the match-by-match records", async () => {
    setHistory([gw(1)], [makeSeason({ seasonName: "2014/15", totalPoints: 90, minutes: 2000 }), makeSeason({ seasonName: "2025/26", totalPoints: 170, minutes: 3100 })]);
    const { getByRole, findByText } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2014\/15/ }));
    expect(await findByText(/No match-by-match record for 2014\/15/)).toBeTruthy();
  });

  it("with a second source: its columns in its colour, a joint heading, and its own Views", async () => {
    const { getByText, container, getByRole } = renderPlayer(fakeSource());
    expect(getByText("FPL & Understat · Match Log").closest(".profile-section-heading")!.classList.contains("col-source-crossover")).toBe(true);
    const position = [...matchLog(container).querySelectorAll("thead th")].find((th) => th.textContent === "Position")!;
    expect(position.classList.contains("col-source-understat")).toBe(true);
    expect(matchLog(container).querySelector("tbody tr")!.textContent).toContain("2026/27:102");
    expect(getByText("Understat · Views").closest(".profile-section-heading")!.classList.contains("col-source-understat")).toBe(true);
    // The profile opens on Last Completed Season.
    expect(getByText("Shot card for 2025/26")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    // Most recent first: fixture 2 (a match he sat out) then fixture 1 (one he played).
    await waitFor(() => expect(matchLog(container).querySelectorAll("tbody tr")[1].textContent).toContain("2024/25:1"));
    // <no_minutes_no_figures>: the match he didn't play shows "—" for every figure, the second source's too.
    expect(matchLog(container).querySelector("tbody tr")!.textContent).not.toContain("2024/25:2");
  });

  it("<no_minutes_no_figures>: a match he sat out shows — for every figure, never 0, while its opponent and result stay", async () => {
    const { getByRole, container } = renderPlayer();
    fireEvent.click(getByRole("button", { name: /^2024\/25: 150 pts/ }));
    await waitFor(() => expect(matchLog(container)).toBeTruthy());
    const log = matchLog(container);
    const headers = [...log.querySelectorAll("thead th")].map((th) => th.textContent);
    const benched = [...log.querySelectorAll("tbody tr")].find((tr) => tr.textContent!.includes("LEI"))!;
    const cells = [...benched.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells[headers.indexOf("Opponent")]).toContain("LEI");
    expect(cells[headers.indexOf("Result")]).toContain("0–1");
    for (const name of ["Points", "Minutes", "Goals", "Clean Sheets", "BPS"]) expect(cells[headers.indexOf(name)], name).toBe("—");
    // Totals still add up the matches he played: 8 points from fixture 1.
    const totalsRow = log.querySelector("tfoot tr")!;
    expect(totalsRow.querySelectorAll("td")[headers.indexOf("Points") - 2].textContent).toBe("8");
  });
});

describe("Player profile — Match Log ⇄ toggles", () => {
  it("FPL headers are green; a figure both sources have switches whole, Totals included", () => {
    const { container } = renderPlayer(fakeSource());
    const log = matchLog(container);
    const header = (name: string) => [...log.querySelectorAll<HTMLElement>("thead th")].find((th) => th.textContent === name)!;
    for (const name of ["GW", "Opponent", "Points", "Defensive Contributions"]) expect(header(name).classList.contains("col-source-fpl"), name).toBe(true);
    expect(within(header("Points")).queryByRole("button")).toBeNull();
    fireEvent.click(within(header("xG")).getByRole("button", { name: /Click to show Understat's/ }));
    expect(header("xG").classList.contains("col-source-understat")).toBe(true);
    const xgIndex = [...log.querySelectorAll("thead th")].indexOf(header("xG"));
    expect(log.querySelector("tbody tr")!.querySelectorAll("td")[xgIndex].textContent).toBe("us-xg-102");
    expect(log.querySelector("tfoot tr")!.textContent).toContain("9.99");
  });
});

describe("Team profile — Match Log", () => {
  const match = (fixture: number, opponentCode: number, overrides: Partial<ClubMatch> = {}): ClubMatch => ({
    fixture, event: fixture, opponentCode, home: true, goalsFor: 2, goalsAgainst: 1, fantasyPoints: 50, goals: 2, assists: 2, bonus: 3, xG: 1.5, xA: 1.2, xGI: 2.7, xGC: 0.9, dc: null,
    ...overrides,
  });
  const season = (name: string, code: number, shortName: string, matches: ClubMatch[], complete = true): ClubSeason =>
    ({
      season: name, code, name: shortName, shortName, complete, played: matches.length, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 1, cleanSheets: 0,
      leaguePoints: 3, leaguePosition: 1, fantasyPoints: 50, goals: 2, assists: 2, bonus: 3, xG: 1.5, xA: 1.2, xGI: 2.7, xGC: 0.9, dc: null, matches,
    }) as ClubSeason;

  beforeEach(() => {
    setApp([], {
      clubSeasons: [
        season("2024/25", 3, "ARS", [match(7, 90)]),
        season("2024/25", 90, "BUR", [match(7, 3, { home: false })]),
        season("2025/26", 3, "ARS", [match(1, 8)]),
        season("2025/26", 8, "CHE", [match(1, 3, { home: false })]),
        season("2026/27", 3, "ARS", [match(11, 8), match(12, 8)], false),
      ],
    });
  });

  function renderTeam(source: ExternalStatsSource | null = null) {
    return render(
      <ExternalStatsContext.Provider value={source}>
        <MemoryRouter initialEntries={["/teams?teamProfile=1"]}>
          <TeamDetailOverlay />
        </MemoryRouter>
      </ExternalStatsContext.Provider>,
    );
  }
  const teamLog = (container: HTMLElement) => container.querySelector<HTMLTableElement>('table[aria-label="Arsenal match log"]')!;

  it("follows the picked season, naming opponents as they were that season", () => {
    const { getByRole, container } = renderTeam();
    expect(teamLog(container).querySelectorAll("tbody tr")).toHaveLength(2);
    fireEvent.click(getByRole("button", { name: /^2024\/25/ }));
    const rows = teamLog(container).querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("BUR (H)");
  });

  it("FPL headers are green, and xGC switches to the second source's", () => {
    const { container } = renderTeam(fakeSource());
    const header = (name: string) => [...teamLog(container).querySelectorAll<HTMLElement>("thead th")].find((th) => th.textContent === name)!;
    expect(header("GW").classList.contains("col-source-fpl")).toBe(true);
    expect(header("FPL Points").classList.contains("col-source-fpl")).toBe(true);
    fireEvent.click(within(header("xGC")).getByRole("button"));
    expect(header("xGC").classList.contains("col-source-understat")).toBe(true);
    expect(teamLog(container).querySelector("tbody tr")!.textContent).toContain("us-xgc-12");
    expect(teamLog(container).querySelector("tfoot tr")!.textContent).toContain("7.77");
  });

  it("with a second source: its columns, totals and Views", () => {
    const { getByText, container } = renderTeam(fakeSource());
    expect(getByText("FPL & Understat · Match Log")).toBeTruthy();
    const header = [...teamLog(container).querySelectorAll("thead th")].find((th) => th.textContent === "Win Chance")!;
    expect(header.classList.contains("col-source-understat")).toBe(true);
    expect(teamLog(container).querySelector("tbody tr")!.textContent).toContain("w12");
    expect(teamLog(container).querySelector("tfoot tr")!.textContent).toContain("1.5");
    expect(getByText("Club card for 2025/26")).toBeTruthy();
  });
});
