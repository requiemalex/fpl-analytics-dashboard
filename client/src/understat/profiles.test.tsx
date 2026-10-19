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
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 90 }], shots: [] } }]]);
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
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4 },
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

describe("Understat's profile cards", () => {
  it("one season: a dot per shot, goals filled", () => {
    const shots = [shot(1, "Goal", 0.76), shot(1, "SavedShot", 0.05), shot(2, "MissedShots", 0.1)];
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [], shots } }]]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    expect(container.querySelectorAll("circle.shot-map-goal")).toHaveLength(1 + 1); // the goal, and the key's swatch
    expect(container.querySelectorAll("svg[role=img] circle.shot-map-miss")).toHaveLength(2);
    expect(getByText("Shots").nextSibling!.textContent).toBe("3");
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

  it("says loading, and never shows a 0 for a season Understat has nothing for", () => {
    const loading = profilesWith([[playerKey(500, "2025/26"), { state: "loading" }]]);
    expect(render(<>{loading.playerCards(500, { mode: "live", seasons: ["2025/26"] })}</>).getByText("Loading…")).toBeTruthy();
    cleanup();
    const none = profilesWith([[playerKey(500, "2025/26"), { state: "none" }]]);
    expect(render(<>{none.playerCards(500, { mode: "live", seasons: ["2025/26"] })}</>).getByText(/No Understat record/)).toBeTruthy();
  });

  it("a club's formations: time shares and rates per 90, no rate under a match's worth of minutes", () => {
    const formation = (name: string, minutes: number, xG: number) => ({ formation: name, minutes, shots: 10, goals: 2, xG, shotsAgainst: 8, goalsAgainst: 1, xGA: xG / 2 });
    const detail: UsClubSeasonDetail = { matches: [], shots: [], shotsAgainst: [], formations: [formation("4-3-3", 900, 15), formation("3-5-2", 45, 0.4)] };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const { getByText } = render(<>{p.clubCards(3, { mode: "lastSeason", seasons: ["2025/26"] })}</>);
    const main = getByText("4-3-3").closest("tr")!;
    expect([...main.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["4-3-3", "95%", "1.50", "0.75", "2–1"]);
    const brief = getByText("3-5-2").closest("tr")!;
    expect([...brief.querySelectorAll("td")].map((td) => td.textContent).slice(2, 4)).toEqual(["—", "—"]);
    expect(getByText("Shot Map · Taken")).toBeTruthy();
    expect(getByText("Shot Map · Faced")).toBeTruthy();
  });
});
