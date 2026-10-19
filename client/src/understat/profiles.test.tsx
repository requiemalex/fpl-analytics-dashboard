import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { relativeCellTint } from "../utils/colorScale";
import { clubKey, createProfiles, playerKey } from "./profiles";
import type { DetailLoad, UsClubSeasonDetail, UsPlayerSeasonDetail, UsShot } from "./profileData";

afterEach(cleanup);

const shot = (fixture: number, result: string, xG: number, x = 0.9, y = 0.5): UsShot => ({ fixture, minute: 10, x, y, xG, result, situation: "OpenPlay", shotType: "RightFoot" });
const noop = { player: () => {}, club: () => {} };

function profilesWith(entries: [string, DetailLoad<UsPlayerSeasonDetail> | DetailLoad<UsClubSeasonDetail>][]) {
  return createProfiles(new Map(entries), noop);
}

describe("Understat's Match Log columns", () => {
  it("a player's position in each match, spelled out on hover; — for a match Understat has none for", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 90, xG: 0.3, xA: 0.1, assists: 1 }], shots: [] } }]]);
    const [col] = p.playerMatchColumns(500, "2025/26");
    const { container } = render(
      <div>
        <span data-f="7">{col.cell(7)}</span>
        <span data-f="8">{col.cell(8)}</span>
      </div>,
    );
    const seven = container.querySelector('[data-f="7"] span')!;
    expect(seven.textContent).toBe("AMR");
    expect(seven.getAttribute("title")).toBe("Attacking midfield, right");
    expect(container.querySelector('[data-f="8"]')!.textContent).toBe("—");
  });

  it("a club's result chances: no Totals; an Average coloured against every club that season — more wins better, more defeats worse, a draw neither", () => {
    const detail: UsClubSeasonDetail = {
      matches: [
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15, xG: 2.1, xGA: 0.4, xA: 1.5, assists: 2 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4, xG: 0.9, xGA: 1.3, xA: 0.6, assists: null },
      ],
      shots: [],
      shotsAgainst: [],
      formations: null,
      league: [
        { win: 0.45, draw: 0.275, loss: 0.275 },
        { win: 0.2, draw: 0.3, loss: 0.5 },
        { win: 0.7, draw: 0.2, loss: 0.1 },
      ],
    };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const [win, draw, loss] = p.clubMatchColumns(3, "2025/26", [1, 2]);
    expect(win.cell(1)).toBe("60%");
    expect(win.total).toBe("—");
    expect(win.average).toBe("45%");
    // 45% sits between the league's 20% and 70% — as the FPL columns' tints are worked out.
    expect(win.averageTint).toBe(relativeCellTint(0.45, 0.2, 0.7, true));
    expect(loss.averageTint).toBe(relativeCellTint(0.275, 0.1, 0.5, false));
    expect(draw.averageTint).toBeUndefined();
    // A listed match Understat lacks is left out of the Average (not a 0), and the cell says so on hover.
    const [partial] = p.clubMatchColumns(3, "2025/26", [1, 2, 3]);
    const { container } = render(<div>{partial.average}</div>);
    expect(container.textContent).toBe("45%");
    expect(container.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches Understat has a figure for");
    expect(partial.averageTint).toBe(relativeCellTint(0.45, 0.2, 0.7, true));
    const [none] = p.clubMatchColumns(3, "2025/26", [3]);
    expect(none.average).toBe("—");
    expect(none.averageTint).toBeUndefined();
  });
});

describe("Understat's version of figures both sources have (the ⇄ toggles)", () => {
  it("a player: a match FPL says he didn't play is a provable 0; one he played that Understat lacks is —", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 88, xG: 0.3, xA: 0.1, assists: 1 }], shots: [] } }]]);
    const alt = p.playerMatchAlternates(500, "2025/26", [
      { fixtureId: 7, minutes: 90 },
      { fixtureId: 8, minutes: 0 },
    ]);
    expect(alt.min.cell(7)).toBe("88");
    expect(alt.xg.cell(8)).toBe("0.00");
    expect(alt.xgi.cell(7)).toBe("0.40");
    expect(alt.xg.total).toBe("0.30");
    expect(alt.xg.average).toBe("0.15");
    const missing = p.playerMatchAlternates(500, "2025/26", [{ fixtureId: 9, minutes: 60 }]);
    expect(missing.xg.cell(9)).toBe("—");
    expect(missing.xg.total).toBe("—");
    expect(missing.xg.average).toBe("—");
  });

  it("a player: Totals and Average cover the matches Understat has, leaving out (not zeroing) one it hasn't synced yet, and say so on hover", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 88, xG: 0.3, xA: 0.1, assists: 1 }], shots: [] } }]]);
    const alt = p.playerMatchAlternates(500, "2025/26", [
      { fixtureId: 7, minutes: 90 },
      { fixtureId: 8, minutes: 0 },
      { fixtureId: 9, minutes: 13 },
    ]);
    expect(alt.xg.cell(9)).toBe("—");
    const { container } = render(
      <div>
        <span data-r="total">{alt.xg.total}</span>
        <span data-r="average">{alt.xg.average}</span>
      </div>,
    );
    const total = container.querySelector('[data-r="total"]')!;
    const average = container.querySelector('[data-r="average"]')!;
    expect(total.textContent).toBe("0.30");
    // 0.30 over the 2 matches with a figure (one a provable 0), not over 3.
    expect(average.textContent).toBe("0.15");
    expect(total.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches Understat has a figure for");
    expect(average.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches Understat has a figure for");
  });

  it("before Understat's figures have loaded, every match is —, never 0", () => {
    const alt = profilesWith([]).playerMatchAlternates(500, "2025/26", [{ fixtureId: 8, minutes: 0 }]);
    expect(alt.xg.cell(8)).toBe("—");
  });

  it("a club: each match's line; Totals over the matches that have the figure", () => {
    const detail: UsClubSeasonDetail = {
      matches: [
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15, xG: 2.1, xGA: 0.4, xA: 1.5, assists: 2 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4, xG: 0.9, xGA: 1.3, xA: 0.6, assists: null },
      ],
      shots: [],
      shotsAgainst: [],
      formations: null,
      league: [],
    };
    const alt = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]).clubMatchAlternates(3, "2025/26", [1, 2]);
    expect(alt.xgc.cell(2)).toBe("1.30");
    expect(alt.xgc.total).toBe("1.70");
    const { container } = render(<div>{alt.a.total}</div>);
    expect(container.textContent).toBe("2");
    expect(container.querySelector("span")!.getAttribute("title")).toBe("From the 1 of 2 matches Understat has a figure for");
  });
});

describe("Understat's profile cards", () => {
  it("one season: a dot per shot, goals filled", () => {
    const shots = [shot(1, "Goal", 0.76), shot(1, "SavedShot", 0.05), shot(2, "MissedShots", 0.1)];
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [], shots } }]]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    expect(container.querySelectorAll("circle.shot-map-goal")).toHaveLength(1 + 1); // the goal, and the key's swatch
    expect(container.querySelectorAll("svg[role=img] circle.shot-map-miss")).toHaveLength(2);
    expect(getByText("2025/26", { selector: ".shot-stats-heading" })).toBeTruthy();
    expect(getByText("Shots").nextSibling!.textContent).toBe("3");
    expect(getByText("On Target").nextSibling!.textContent).toBe("2");
    expect(getByText("xG").nextSibling!.textContent).toBe("0.91");
  });

  it("a Historic Average: zones shaded by shots a season, figures per season, over only the seasons Understat has", () => {
    const p = profilesWith([
      [playerKey(500, "2024/25"), { state: "ready", detail: { matches: [], shots: [shot(1, "Goal", 0.5), shot(2, "Goal", 0.5)] } }],
      [playerKey(500, "2023/24"), { state: "ready", detail: { matches: [], shots: [shot(3, "MissedShots", 0.2)] } }],
      [playerKey(500, "2022/23"), { state: "none" }],
    ]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "historicAverage", seasons: ["2024/25", "2023/24", "2022/23"] })}</>);
    expect(container.querySelectorAll("rect.shot-map-zone")).toHaveLength(1);
    expect(container.querySelector("rect.shot-map-zone title")!.textContent).toBe("1.5 shots a season · 1.0 goals · 0.60 xG");
    // One heading says the figures are per season, over the seasons Understat has.
    expect(getByText("Per season · 2 seasons")).toBeTruthy();
    expect(getByText("Shots").nextSibling!.textContent).toBe("1.5");
  });

  it("a point more than one goal was scored from (penalties, all on the spot) carries a count of them", () => {
    const pen = (result: string) => ({ ...shot(1, result, 0.76, 0.885, 0.5), situation: "Penalty" });
    const shots = [pen("Goal"), pen("Goal"), pen("Goal"), pen("SavedShot"), shot(2, "Goal", 0.3)];
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [], shots } }]]);
    const { container } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    const counts = container.querySelectorAll("svg[role=img] .shot-map-count");
    expect(counts).toHaveLength(1);
    expect(counts[0].querySelector("text")!.textContent).toBe("3");
    expect(counts[0].querySelector("title")!.textContent).toBe("3 goals from 4 shots taken from exactly here");
  });

  it("a shot from further out than the map draws is marked on its edge and counted, never moved inside", () => {
    const shots = [shot(1, "Goal", 0.5), shot(2, "MissedShots", 0.02, 0.55, 0.3)];
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [], shots } }]]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    expect(container.querySelectorAll("svg[role=img] circle.shot-map-miss")).toHaveLength(0);
    const marker = container.querySelector("svg[role=img] path.shot-map-beyond")!;
    expect(marker.querySelector("title")!.textContent).toContain("47 m out");
    expect(getByText("Further than 35 m")).toBeTruthy();
    expect(getByText("Shots").nextSibling!.textContent).toBe("2");
  });

  it("says loading, and never shows a 0 for a season Understat has nothing for", () => {
    const loading = profilesWith([[playerKey(500, "2025/26"), { state: "loading" }]]);
    expect(render(<>{loading.playerCards(500, { mode: "live", seasons: ["2025/26"] })}</>).getByText("Loading…")).toBeTruthy();
    cleanup();
    const none = profilesWith([[playerKey(500, "2025/26"), { state: "none" }]]);
    expect(render(<>{none.playerCards(500, { mode: "live", seasons: ["2025/26"] })}</>).getByText(/No Understat record/)).toBeTruthy();
  });

  it("a club's formations: the top three by time, a chevron listing every one used, no rate under a match's worth of minutes", () => {
    const formation = (name: string, minutes: number, xG: number) => ({ formation: name, minutes, shots: 10, goals: 2, xG, shotsAgainst: 8, goalsAgainst: 1, xGA: xG / 2 });
    const detail: UsClubSeasonDetail = {
      matches: [],
      shots: [],
      shotsAgainst: [],
      formations: [formation("4-3-3", 900, 15), formation("3-5-2", 45, 0.4), formation("4-4-2", 30, 0.2), formation("5-4-1", 20, 0.1)],
      league: [],
    };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const { getByText, queryByText, getByRole } = render(<>{p.clubCards(3, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    const main = getByText("4-3-3").closest("tr")!;
    expect([...main.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["4-3-3", "90%", "1.50", "0.75", "2", "1"]);
    const brief = getByText("3-5-2").closest("tr")!;
    expect([...brief.querySelectorAll("td")].map((td) => td.textContent).slice(2, 4)).toEqual(["—", "—"]);
    expect(queryByText("5-4-1")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Show all 4 formations used" }));
    expect(getByText("5-4-1")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Show the top 3 only" }));
    expect(queryByText("5-4-1")).toBeNull();
    expect(getByText("Shot Map · Taken")).toBeTruthy();
    expect(getByText("Shot Map · Faced")).toBeTruthy();
  });
});
