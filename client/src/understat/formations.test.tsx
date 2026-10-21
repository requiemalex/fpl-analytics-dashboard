import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { FormationsSection } from "./formations";
import type { DetailLoad, UsClubSeasonDetail, UsFormation, UsLineup } from "./profileData";
import type { UsComparisonContext } from "./comparisons";
import type { UsClubTotals } from "./schema";
import { percentileTint } from "../utils/colorScale";

// FPL's players today: 1001 and 1003 are in FPL; 1002 has left it.
vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: [
      { id: 10, code: 1001, name: "Saka" },
      { id: 30, code: 1003, name: "Rice" },
    ],
  }),
}));

afterEach(cleanup);

const formation = (name: string, minutes: number): UsFormation => ({ formation: name, minutes, shots: 20, goals: 3, xG: 4.5, shotsAgainst: 10, goalsAgainst: 1, xGA: 1.8 });

/** A 4-2-3-1 XI: the given right winger (a linked code, or null), the rest unlinked. */
function xi(fixture: number, rightWinger: { code: number | null; name: string }): UsLineup {
  const others = ["GK", "DL", "DC", "DC", "DR", "DMC", "DMC", "AML", "AMC", "FW"].map((position, i) => ({ position, code: null, name: `Player ${i}` }));
  return { fixture, starters: [...others, { position: "AMR", ...rightWinger }] };
}

function ready(formations: UsFormation[] | null, lineups: UsLineup[] | null): DetailLoad<UsClubSeasonDetail> {
  return { state: "ready", detail: { matches: [], shots: [], shotsAgainst: [], formations, lineups, league: [] } };
}

function Location() {
  return <span data-testid="location">{useLocation().search}</span>;
}

function renderSection(load: DetailLoad<UsClubSeasonDetail> | undefined, request = vi.fn(), compare: UsComparisonContext | null = null) {
  const utils = render(
    <MemoryRouter initialEntries={["/teams?teamProfile=3"]}>
      <FormationsSection code={3} season="2026/27" load={load} request={request} compare={compare} />
      <Location />
    </MemoryRouter>,
  );
  return { ...utils, request };
}

const formations = [formation("4-2-3-1", 900), formation("3-4-2-1", 300), formation("4-4-2", 120), formation("4-3-3", 95), formation("5-4-1", 60)];
const lineups = [xi(1, { code: 1001, name: "Bukayo Saka" }), xi(2, { code: 1001, name: "Bukayo Saka" }), xi(3, { code: 1002, name: "Gone Player" })];

describe("The Team Profile's Formations section", () => {
  it("loads the live season itself", () => {
    const { request, getByText } = renderSection(undefined);
    expect(request).toHaveBeenCalledWith(3, ["2026/27"]);
    expect(getByText("Loading…")).toBeTruthy();
  });

  it("steps through the three most-used formations used for 90+ minutes with arrows, both ways round", () => {
    const { getByText, getByRole, queryByText } = renderSection(ready(formations, lineups));
    expect(getByText("Formation · 4-2-3-1")).toBeTruthy();
    expect(getByText("1 / 3")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Next formation: 3-4-2-1" }));
    expect(getByText("Formation · 3-4-2-1")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Next formation: 4-4-2" }));
    expect(getByText("Formation · 4-4-2")).toBeTruthy();
    // The fourth (4-3-3, 95 min) and one under 90 minutes (5-4-1) aren't shown.
    fireEvent.click(getByRole("button", { name: "Next formation: 4-2-3-1" }));
    expect(getByText("Formation · 4-2-3-1")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Previous formation: 4-4-2" }));
    expect(getByText("Formation · 4-4-2")).toBeTruthy();
    expect(queryByText(/4-3-3|5-4-1/)).toBeNull();
  });

  it("the threshold's stopwatch is grey: nothing shown is under it (<marker_follows_data>)", () => {
    const { container } = renderSection(ready(formations, lineups));
    const badge = container.querySelector(".card-title .minutes-floor-badge")!;
    expect(badge.getAttribute("title")).toContain("only formations used for 90+ minutes");
    expect(badge.classList.contains("small-sample-badge")).toBe(false);
  });

  it("the figures beside the pitch: time, minutes, starts and per-90 rates in this formation", () => {
    const { container } = renderSection(ready(formations, lineups));
    const value = (label: string) => [...container.querySelectorAll(".shot-stats-label")].find((l) => l.textContent === label)!.nextSibling!.textContent;
    // 900 of the 1,475 minutes.
    expect(value("Time")).toBe("61%");
    expect(value("Minutes")).toBe("900");
    expect(value("Starts")).toBe("3");
    expect(value("xG/90")).toBe("0.45");
    expect(value("xGA/90")).toBe("0.18");
    expect(value("Scored")).toBe("3");
    expect(value("Conceded")).toBe("1");
  });

  it("names who started in each slot with his starts; a name in FPL opens his profile in place of the team's", () => {
    const { getByRole, getByTestId } = renderSection(ready(formations, lineups));
    const saka = getByRole("button", { name: "Saka: 2 starts. Open his profile" });
    expect(saka.textContent).toBe("Saka2");
    fireEvent.click(saka);
    expect(getByTestId("location").textContent).toBe("?player=10");
  });

  it("a player no longer in FPL is greyed out, not a link", () => {
    const { getByText, queryByRole } = renderSection(ready(formations, lineups));
    const gone = getByText("Gone Player").closest(".formation-player")!;
    expect(gone.tagName).toBe("SPAN");
    expect(gone.classList.contains("is-gone")).toBe(true);
    expect(gone.getAttribute("title")).toBe("Gone Player: 1 start. Not in FPL's player list now, so there's no profile to open.");
    expect(queryByRole("button", { name: /Gone Player/ })).toBeNull();
  });

  it("a formation the club never started in says so, with its figures still beside it", () => {
    const { getByRole, getByText } = renderSection(ready(formations, lineups));
    fireEvent.click(getByRole("button", { name: "Next formation: 3-4-2-1" }));
    expect(getByText(/hasn't started a match in this formation/)).toBeTruthy();
    expect(getByText("Starts").nextSibling!.textContent).toBe("0");
  });

  it("one formation: no arrows; none used for 90 minutes yet, or no matches: says so", () => {
    const one = renderSection(ready([formation("4-2-3-1", 450)], lineups));
    expect(one.queryByRole("button", { name: /formation:/ })).toBeNull();
    cleanup();
    expect(renderSection(ready([formation("4-2-3-1", 45)], [])).getByText("No formation used for 90+ minutes yet this season.")).toBeTruthy();
    cleanup();
    expect(renderSection(ready([], [])).getByText("No matches played yet this season.")).toBeTruthy();
  });

  it("figures not available: —, never an empty pitch", () => {
    expect(renderSection(ready(null, null)).getByText("Not available yet (—).")).toBeTruthy();
    cleanup();
    expect(renderSection(ready(formations, null)).getByText("Line-ups aren't available yet (—).")).toBeTruthy();
    cleanup();
    expect(renderSection({ state: "none" }).getByText("No Understat record for this season (—).")).toBeTruthy();
  });

  it("its figures are coloured against every other club's per-90 for the season: more xG better, less xGA better; time isn't coloured", () => {
    const club = (xG: number, xGA: number, goalsFor: number, goalsAgainst: number) => ({ played: 10, xG, xGA, goalsFor, goalsAgainst }) as unknown as UsClubTotals;
    const compare: UsComparisonContext = {
      seasons: new Map([["2026/27", { season: "2026/27", complete: false, latestMatchDate: null, players: new Map(), clubs: new Map([[3, club(99, 99, 99, 99)], [1, club(10, 15, 20, 15)], [2, club(8, 10, 15, 10)]]) }]]),
      liveSeason: "2026/27",
      positionByCode: new Map(),
      clubCodeByPlayerCode: new Map(),
    };
    const { container } = renderSection(ready(formations, lineups), vi.fn(), compare);
    const shade = (label: string) => ([...container.querySelectorAll(".shot-stats-label")].find((l) => l.textContent === label)!.nextSibling as HTMLElement).style.background;
    const css = (rank: number) => render(<span style={{ background: percentileTint(rank) }} />).container.querySelector("span")!.style.background;
    // In 4-2-3-1: 0.45 xG/90 (theirs 1.0 and 0.8, its own season left out) — the bottom; 0.18 xGA/90 (theirs 1.5 and 1.0) — the top.
    expect(shade("xG/90")).toBe(css(100 / 6));
    expect(shade("xGA/90")).toBe(css(250 / 3));
    // Goals per 90 in it: 0.3 scored (theirs 2.0, 1.5), 0.1 conceded (theirs 1.5, 1.0).
    expect(shade("Scored")).toBe(css(100 / 6));
    expect(shade("Conceded")).toBe(css(250 / 3));
    expect(shade("Time")).toBe("");
    expect(shade("Starts")).toBe("");
  });
});
