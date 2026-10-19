import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
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

  it("a club's result chances: totals add up to expected results, and are — when any listed match lacks them", () => {
    const detail: UsClubSeasonDetail = {
      matches: [
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15, xG: 2.1, xGA: 0.4, xA: 1.5, assists: 2 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4, xG: 0.9, xGA: 1.3, xA: 0.6, assists: null },
      ],
      shots: [],
      shotsAgainst: [],
      formations: null,
    };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const [win] = p.clubMatchColumns(3, "2025/26", [1, 2]);
    expect(win.cell(1)).toBe("60%");
    expect(win.total).toBe("0.9");
    expect(win.average).toBe("45%");
    const [partial] = p.clubMatchColumns(3, "2025/26", [1, 2, 3]);
    expect(partial.total).toBe("—");
    expect(partial.average).toBe("—");
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
  });

  it("before Understat's figures have loaded, every match is —, never 0", () => {
    const alt = profilesWith([]).playerMatchAlternates(500, "2025/26", [{ fixtureId: 8, minutes: 0 }]);
    expect(alt.xg.cell(8)).toBe("—");
  });

  it("a club: each match's line, Totals — when any match lacks the figure", () => {
    const detail: UsClubSeasonDetail = {
      matches: [
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15, xG: 2.1, xGA: 0.4, xA: 1.5, assists: 2 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4, xG: 0.9, xGA: 1.3, xA: 0.6, assists: null },
      ],
      shots: [],
      shotsAgainst: [],
      formations: null,
    };
    const alt = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]).clubMatchAlternates(3, "2025/26", [1, 2]);
    expect(alt.xgc.cell(2)).toBe("1.30");
    expect(alt.xgc.total).toBe("1.70");
    expect(alt.a.total).toBe("—");
  });
});

describe("Understat's profile cards", () => {
  it("one season: a dot per shot, goals filled", () => {
    const shots = [shot(1, "Goal", 0.76), shot(1, "SavedShot", 0.05), shot(2, "MissedShots", 0.1)];
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [], shots } }]]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    expect(container.querySelectorAll("circle.shot-map-goal")).toHaveLength(1 + 1); // the goal, and the key's swatch
    expect(container.querySelectorAll("svg[role=img] circle.shot-map-miss")).toHaveLength(2);
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
    expect(getByText("Shots / Season").nextSibling!.textContent).toBe("1.5");
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

  it("a club's formations: time shares and rates per 90, no rate under a match's worth of minutes", () => {
    const formation = (name: string, minutes: number, xG: number) => ({ formation: name, minutes, shots: 10, goals: 2, xG, shotsAgainst: 8, goalsAgainst: 1, xGA: xG / 2 });
    const detail: UsClubSeasonDetail = {
      matches: [],
      shots: [],
      shotsAgainst: [],
      formations: [formation("4-3-3", 900, 15), formation("3-5-2", 45, 0.4), formation("5-4-1", 20, 0.1), formation("4-4-2", 30, 0.2)],
    };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const { getByText } = render(<>{p.clubCards(3, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    const main = getByText("4-3-3").closest("tr")!;
    expect([...main.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["4-3-3", "90%", "1.50", "0.75", "2", "1"]);
    // Formations used for under 90 minutes are one "Other" row, named on hover, with no rates.
    const other = getByText("Other (3)").closest("tr")!;
    expect(other.getAttribute("title")).toBe("Each used for under 90 minutes: 3-5-2, 4-4-2, 5-4-1");
    expect([...other.querySelectorAll("td")].map((td) => td.textContent).slice(1)).toEqual(["10%", "—", "—", "6", "3"]);
    expect(getByText("Shot Map · Taken")).toBeTruthy();
    expect(getByText("Shot Map · Faced")).toBeTruthy();
  });
});
