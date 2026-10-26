import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { percentileTint } from "../utils/colorScale";
import { clubKey, createProfiles, playerKey } from "./profiles";
import type { DetailLoad, UsClubSeasonDetail, UsPlayerSeasonDetail, UsShot } from "./profileData";
import type { UsComparisonContext } from "./comparisons";
import type { UsPlayerTotals } from "./schema";

afterEach(cleanup);

const shot = (fixture: number, result: string, xG: number, x = 0.9, y = 0.5): UsShot => ({ fixture, minute: 10, x, y, xG, result, situation: "OpenPlay", shotType: "RightFoot" });
const noop = { player: () => {}, club: () => {} };

function profilesWith(entries: [string, DetailLoad<UsPlayerSeasonDetail> | DetailLoad<UsClubSeasonDetail>][]) {
  return createProfiles(new Map(entries), noop);
}

describe("Understat's Match Log columns", () => {
  it("a player's position in each match, spelled out on hover; — for a match Understat has none for", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 90, xG: 0.3, xA: 0.1, assists: 1 }], shots: [], shotsFaced: [] } }]]);
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

  it("a club's result chances: a blank Totals (none by design, never — which means missing); an Average coloured against every club that season — more wins better, more defeats worse, a draw neither", () => {
    const detail: UsClubSeasonDetail = {
      matches: [
        { fixture: 1, win: 0.6, draw: 0.25, loss: 0.15, xG: 2.1, xGA: 0.4, xA: 1.5, assists: 2 },
        { fixture: 2, win: 0.3, draw: 0.3, loss: 0.4, xG: 0.9, xGA: 1.3, xA: 0.6, assists: null },
      ],
      shots: [],
      shotsAgainst: [],
      formations: null,
      lineups: null,
      league: [
        { win: 0.45, draw: 0.275, loss: 0.275 },
        { win: 0.2, draw: 0.3, loss: 0.5 },
        { win: 0.7, draw: 0.2, loss: 0.1 },
        { win: 0.3, draw: 0.3, loss: 0.4 },
      ],
    };
    const p = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const [win, draw, loss] = p.clubMatchColumns(3, "2025/26", [1, 2]);
    expect(win.cell(1)).toBe("60%");
    expect(win.total).toBe("");
    expect(draw.total).toBe("");
    expect(loss.total).toBe("");
    expect(win.average).toBe("45%");
    // Ranked among the other clubs (its own league entry left out), as the FPL columns are:
    // 45% beats 20% and 30% of 20%, 30%, 70% → (2 + ½) ÷ 4 = 62.5; a 27.5% loss chance beats 40% and 50% → 62.5 too.
    expect(win.averageTint).toBe(percentileTint(62.5));
    expect(loss.averageTint).toBe(percentileTint(62.5));
    expect(draw.averageTint).toBeUndefined();
    // A listed match Understat lacks is left out of the Average (not a 0), and the cell says so on hover.
    const [partial] = p.clubMatchColumns(3, "2025/26", [1, 2, 3]);
    const { container } = render(<div>{partial.average}</div>);
    expect(container.textContent).toBe("45%");
    expect(container.querySelector("span")!.getAttribute("title")).toBe("From the 2 of 3 matches Understat has a figure for");
    expect(partial.averageTint).toBe(percentileTint(62.5));
    const [none] = p.clubMatchColumns(3, "2025/26", [3]);
    expect(none.average).toBe("—");
    expect(none.averageTint).toBeUndefined();
  });
});

describe("Understat's version of figures both sources have (the ⇄ toggles)", () => {
  it("a player: a match FPL says he didn't play is a provable 0; one he played that Understat lacks is —", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 88, xG: 0.3, xA: 0.1, assists: 1 }], shots: [], shotsFaced: [] } }]]);
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
    const p = profilesWith([[playerKey(500, "2025/26"), { state: "ready", detail: { matches: [{ fixture: 7, position: "AMR", minutes: 88, xG: 0.3, xA: 0.1, assists: 1 }], shots: [], shotsFaced: [] } }]]);
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
      lineups: null,
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

/** A zone's group on the map, found by the zone's name (its hover starts with it). */
function zone(container: HTMLElement, name: string): Element | undefined {
  return [...container.querySelectorAll("g.shot-map-zone")].find((g) => g.querySelector("title")!.textContent!.startsWith(`${name}:`));
}
const zoneTitle = (container: HTMLElement, name: string) => zone(container, name)?.querySelector("title")!.textContent ?? null;
/** A zone's figures: drawn in the label layer over the pitch lines, matched to the zone by its key. */
const zoneText = (container: HTMLElement, name: string) =>
  container.querySelector(`.shot-map-labels [data-zone="${zone(container, name)!.getAttribute("data-zone")}"]`)?.textContent ?? "";
const zoneFill = (container: HTMLElement, name: string) => Number((zone(container, name)!.querySelector("rect") as SVGElement).style.fillOpacity);
const panel = (getByText: (t: string) => HTMLElement, label: string) => getByText(label).nextSibling!.textContent;
const playerDetail = (shots: UsShot[], shotsFaced: UsShot[] | null = []): DetailLoad<UsPlayerSeasonDetail> => ({ state: "ready", detail: { matches: [], shots, shotsFaced } });

describe("Understat's shot maps: zones", () => {
  // x 0.97 is 3 m out (the six-yard box), 0.9 is 10.5 m (the middle of the box), 0.8 is 21 m (the edge of the box); y 0.5 is central.
  const shots = [shot(1, "Goal", 0.5, 0.97), shot(1, "SavedShot", 0.3, 0.97), shot(2, "MissedShots", 0.1, 0.9), shot(2, "BlockedShot", 0.06, 0.8)];

  it("draws the figures over the pitch lines, so the penalty spot never crosses them", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), playerDetail(shots)]]);
    const { container } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "MID")}</>);
    const layers = [...container.querySelector(".shot-map svg")!.children].map((el) => el.getAttribute("class"));
    expect(layers.indexOf("shot-map-labels")).toBe(layers.length - 1);
    expect(layers.indexOf("shot-map-lines")).toBeLessThan(layers.indexOf("shot-map-labels"));
    expect(layers.lastIndexOf("shot-map-zone")).toBeLessThan(layers.indexOf("shot-map-lines"));
  });

  it("each zone shows its share of the shots, how many and their average xG; one with none shows nothing", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), playerDetail(shots)]]);
    const { container } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "MID")}</>);
    expect(zoneText(container, "Six-yard box")).toBe("50%2 shots0.40 xG/shot");
    expect(zoneTitle(container, "Six-yard box")).toBe("Six-yard box: 2 shots (50% of them) · 1 goal · 0.40 xG per shot");
    expect(zoneText(container, "Centre of the box")).toBe("25%1 shot0.10 xG/shot");
    expect(zoneText(container, "Edge of the box")).toBe("25%1 shot0.06 xG/shot");
    expect(zoneText(container, "Left of the box")).toBe("");
    expect(zoneTitle(container, "Left of the box")).toBe("Left of the box: no shots");
    // The busiest zone is shaded darkest; an empty one not at all.
    expect(zoneFill(container, "Six-yard box")).toBeCloseTo(0.6);
    expect(zoneFill(container, "Centre of the box")).toBeCloseTo(0.34);
    expect(zoneFill(container, "Left of the box")).toBe(0);
    // No dots any more, and no band for shots from further out when there are none.
    expect(container.querySelectorAll("svg[role=img] circle.shot-map-goal, svg[role=img] circle.shot-map-miss")).toHaveLength(0);
    expect(zoneTitle(container, "Further than 35 m")).toBeNull();
  });

  it("the panel: shots, on target and its share, goals and conversion, xG, NPxG, xG per shot, penalties", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), playerDetail(shots)]]);
    const { getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "MID")}</>);
    expect(getByText("2025/26", { selector: ".shot-stats-heading" })).toBeTruthy();
    expect(panel(getByText, "Shots")).toBe("4");
    expect(panel(getByText, "On Target")).toBe("2");
    expect(panel(getByText, "On Target %")).toBe("50%");
    expect(panel(getByText, "Goals")).toBe("1");
    expect(panel(getByText, "Conversion %")).toBe("25%");
    expect(panel(getByText, "xG")).toBe("0.96");
    expect(panel(getByText, "xG/Shot")).toBe("0.24");
    expect(panel(getByText, "Penalties Taken")).toBe("0");
  });

  it("penalties: how many he took, and how many he scored (Understat puts them all on the spot)", () => {
    const pen = (result: string) => ({ ...shot(1, result, 0.76, 0.895, 0.5), situation: "Penalty" });
    const p = profilesWith([[playerKey(500, "2025/26"), playerDetail([pen("Goal"), pen("Goal"), pen("Goal"), pen("SavedShot"), shot(2, "Goal", 0.3)])]]);
    const { getByText, container } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "FWD")}</>);
    expect(panel(getByText, "Penalties Taken")).toBe("4");
    expect(panel(getByText, "Penalty Goals")).toBe("3");
    expect(panel(getByText, "Conversion %")).toBe("80%");
    expect(zoneText(container, "Centre of the box")).toBe("100%5 shots0.67 xG/shot");
  });

  it("a Historic Average: shots a season in each zone, shares and rates from the totals, over only the seasons Understat has", () => {
    const p = profilesWith([
      [playerKey(500, "2024/25"), playerDetail([shot(1, "Goal", 0.5), shot(2, "Goal", 0.5)])],
      [playerKey(500, "2023/24"), playerDetail([shot(3, "MissedShots", 0.2)])],
      [playerKey(500, "2022/23"), { state: "none" }],
    ]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "historicAverage", seasons: ["2024/25", "2023/24", "2022/23"] }, "MID")}</>);
    expect(zoneTitle(container, "Centre of the box")).toBe("Centre of the box: 1.5 shots a season (100% of them) · 1.0 goal · 0.40 xG per shot");
    expect(getByText("Per season · 2 seasons")).toBeTruthy();
    // Shots are whole, as the Shots column (<whole_numbers>); his goals are a small count, so 1 decimal averaged.
    expect(panel(getByText, "Shots")).toBe("2");
    expect(panel(getByText, "Goals")).toBe("1.0");
    expect(panel(getByText, "Conversion %")).toBe("67%");
  });

  it("a Historic Average over one season follows the Data View, not the season count (<whole_numbers>)", () => {
    const p = profilesWith([[playerKey(500, "2024/25"), playerDetail([shot(1, "Goal", 0.5), shot(2, "Goal", 0.5)])]]);
    const averaged = render(<>{p.playerCards(500, { mode: "historicAverage", seasons: ["2024/25"] }, "MID")}</>);
    expect(panel(averaged.getByText, "Goals")).toBe("2.0");
    averaged.unmount();
    const single = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2024/25"] }, "MID")}</>);
    expect(panel(single.getByText, "Goals")).toBe("2");
  });

  it("shots from further than the map draws are a band of their own, so every shot is in one zone", () => {
    const p = profilesWith([[playerKey(500, "2025/26"), playerDetail([shot(1, "Goal", 0.5), shot(2, "MissedShots", 0.02, 0.55, 0.3)])]]);
    const { container, getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "MID")}</>);
    expect(zoneTitle(container, "Further than 35 m")).toBe("Further than 35 m: 1 shot (50% of them) · 0 goals · 0.02 xG per shot");
    expect(zoneText(container, "Further than 35 m")).toBe("Further than 35 m · 50% · 1 shot · 0.02 xG/shot");
    expect(getByText("Shots").parentElement!.getAttribute("title")).toBe("1 of them from further than 35 m");
  });

  it("colours the new rates as rates, and penalties taken, within his position (<comparative_colouring>)", () => {
    const none = { shots: 0, goals: 0, xG: 0 };
    const totals = (shots: number, goals: number, penalties = 0) =>
      ({
        minutes: 2000,
        xG: 3,
        xA: 0,
        assists: 0,
        shots,
        shotsOnTarget: goals,
        shotsComplete: true,
        bodyParts: { RightFoot: none, LeftFoot: none, Head: none, OtherBodyPart: none },
        situations: { OpenPlay: { shots: shots - penalties, goals: goals - penalties, xG: 3 }, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: { shots: penalties, goals: penalties, xG: 0.76 * penalties } },
      }) as unknown as UsPlayerTotals;
    const compare: UsComparisonContext = {
      seasons: new Map([
        [
          "2025/26",
          {
            season: "2025/26",
            complete: true,
            latestMatchDate: null,
            players: new Map([
              [500, totals(4, 1)],
              [2, totals(10, 1, 1)],
              [3, totals(10, 2, 1)],
            ]),
            clubs: new Map(),
          },
        ],
      ]),
      liveSeason: "2026/27",
      positionByCode: new Map([
        [500, "MID"],
        [2, "MID"],
        [3, "MID"],
      ]),
      clubCodeByPlayerCode: new Map(),
    };
    const p = createProfiles(new Map([[playerKey(500, "2025/26"), playerDetail(shots)]]), noop, compare);
    const { getByText } = render(<>{p.playerCards(500, { mode: "lastSeason", seasons: ["2025/26"] }, "MID")}</>);
    // His 25% conversion beats 10% and 20%, though his 1 goal is no more than theirs: ranked on the rates, top of three.
    const shade = (label: string) => (getByText(label).nextSibling as HTMLElement).style.background;
    const tint = percentileTint((2.5 / 3) * 100);
    expect(tint).toBeTruthy();
    const expected = render(<span style={{ background: tint }} />).container.querySelector("span")!.style.background;
    expect(shade("Conversion %")).toBe(expected);
    // Goals, a count, ranks below the others (1 against 1 and 2): not green.
    expect(shade("Goals")).not.toBe(expected);
    // Penalties: more is better — his none against their 1 and 1 (both scored, within the goals above) is the bottom of three.
    const low = render(<span style={{ background: percentileTint(100 / 6) }} />).container.querySelector("span")!.style.background;
    expect(low).not.toBe("");
    expect(shade("Penalties Taken")).toBe(low);
    expect(shade("Penalty Goals")).toBe(low);
  });
});

describe("Understat's shot maps: who gets which", () => {
  const faced = [shot(1, "Goal", 0.4), shot(1, "SavedShot", 0.1), shot(2, "MissedShots", 0.05)];
  const p = profilesWith([[playerKey(500, "2025/26"), playerDetail([shot(1, "MissedShots", 0.1)], faced)]]);
  const view = { mode: "lastSeason" as const, seasons: ["2025/26"] };

  it("a midfielder or forward: the shots he took only", () => {
    const { queryByText } = render(<>{p.playerCards(500, view, "MID")}</>);
    expect(queryByText("Shot Map · Taken")).toBeTruthy();
    expect(queryByText("Shot Map · Faced")).toBeNull();
  });

  it("a defender: the shots he took, and the shots his club faced while he was on the pitch, worded as faced", () => {
    const { getByText } = render(<>{p.playerCards(500, view, "DEF")}</>);
    expect(getByText("Shot Map · Taken")).toBeTruthy();
    const title = getByText("Shot Map · Faced");
    expect(title.getAttribute("title")).toContain("while he was on the pitch");
    const card = title.closest(".card") as HTMLElement;
    const inCard = (label: string) => [...card.querySelectorAll(".shot-stats-label")].find((l) => l.textContent === label)!;
    expect(inCard("Shots").nextSibling!.textContent).toBe("3");
    expect(inCard("Conversion %").nextSibling!.textContent).toBe("33%");
    expect(inCard("Conversion %").parentElement!.getAttribute("title")).toBe("Share of the shots conceded");
  });

  it("a defender's shots faced are coloured within his position, per 90 minutes on the pitch, fewer better", () => {
    const none = { shots: 0, goals: 0, xG: 0 };
    const row = (minutes: number, facedShots: number) =>
      ({
        minutes,
        shots: 0,
        shotsOnTarget: 0,
        shotsComplete: true,
        bodyParts: { RightFoot: none, LeftFoot: none, Head: none, OtherBodyPart: none },
        situations: { OpenPlay: none, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: none },
        facing: { shots: facedShots, shotsOnTarget: 0, complete: true, situations: { OpenPlay: { shots: facedShots, goals: 0, xG: facedShots * 0.1 }, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: none } },
      }) as unknown as UsPlayerTotals;
    // His 30 in 900 minutes is the fewest shots, but the most per 90 (3.0, against 1.5 and 2.0).
    const compare: UsComparisonContext = {
      seasons: new Map([["2025/26", { season: "2025/26", complete: true, latestMatchDate: null, players: new Map([[500, row(900, 30)], [2, row(3600, 60)], [3, row(1800, 40)]]), clubs: new Map() }]]),
      liveSeason: "2026/27",
      positionByCode: new Map([[500, "DEF"], [2, "DEF"], [3, "DEF"]]),
      clubCodeByPlayerCode: new Map(),
    };
    const coloured = createProfiles(new Map([[playerKey(500, "2025/26"), playerDetail([], faced)]]), noop, compare);
    const { getByText } = render(<>{coloured.playerCards(500, view, "DEF")}</>);
    const card = getByText("Shot Map · Faced").closest(".card") as HTMLElement;
    const shade = (label: string) => ([...card.querySelectorAll(".shot-stats-label")].find((l) => l.textContent === label)!.nextSibling as HTMLElement).style.background;
    const worst = render(<span style={{ background: percentileTint(100 / 6) }} />).container.querySelector("span")!.style.background;
    expect(worst).not.toBe("");
    expect(shade("Shots")).toBe(worst);
    expect(shade("xG")).toBe(worst);
  });

  it("a goalkeeper: the shots he faced only", () => {
    const { queryByText } = render(<>{p.playerCards(500, view, "GKP")}</>);
    expect(queryByText("Shot Map · Taken")).toBeNull();
    expect(queryByText("Shot Map · Faced")).toBeTruthy();
  });

  it("shots faced from a season that doesn't have them yet: says so, never an empty map", () => {
    const old = profilesWith([[playerKey(500, "2025/26"), playerDetail([], null)]]);
    const { getByText } = render(<>{old.playerCards(500, view, "GKP")}</>);
    expect(getByText(/Not available for this view yet/)).toBeTruthy();
  });

  it("says loading, and never shows a 0 for a season Understat has nothing for", () => {
    const loading = profilesWith([[playerKey(500, "2025/26"), { state: "loading" }]]);
    // The Summary (its season summaries not loaded either) and the shot map.
    expect(render(<>{loading.playerCards(500, { mode: "live", seasons: ["2025/26"] }, "MID")}</>).getAllByText("Loading…")).toHaveLength(2);
    cleanup();
    const none = profilesWith([[playerKey(500, "2025/26"), { state: "none" }]]);
    expect(render(<>{none.playerCards(500, { mode: "live", seasons: ["2025/26"] }, "MID")}</>).getByText(/No Understat record/)).toBeTruthy();
  });

  it("a club: shots taken and faced in the Data View; formations aren't in it any more (their own section)", () => {
    const detail: UsClubSeasonDetail = { matches: [], shots: [shot(1, "Goal", 0.3)], shotsAgainst: faced, formations: [], lineups: [], league: [] };
    const club = profilesWith([[clubKey(3, "2025/26"), { state: "ready", detail }]]);
    const { getByText, queryByText } = render(<>{club.clubCards(3, view)}</>);
    expect(getByText("Shot Map · Taken")).toBeTruthy();
    expect(getByText("Shot Map · Faced")).toBeTruthy();
    expect(queryByText(/Formation/)).toBeNull();
  });
});

describe("Understat's Summary", () => {
  const none = { shots: 0, goals: 0, xG: 0 };
  const row = (minutes: number, xG: number) =>
    ({
      appearances: 10,
      minutes,
      goals: 2,
      assists: 1,
      shots: 20,
      shotsOnTarget: 8,
      keyPasses: 15,
      xG,
      xA: 1,
      npxG: xG,
      npGoals: 2,
      xGChain: 5,
      xGBuildup: 2,
      shotsComplete: true,
      bodyParts: { RightFoot: none, LeftFoot: none, Head: none, OtherBodyPart: none },
      situations: { OpenPlay: { shots: 20, goals: 2, xG }, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: none },
      facing: { shots: 100, shotsOnTarget: 30, complete: true, situations: { OpenPlay: { shots: 100, goals: 10, xG: 9 }, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: none } },
    }) as unknown as UsPlayerTotals;
  const compare = (mine: UsPlayerTotals): UsComparisonContext => ({
    seasons: new Map([["2025/26", { season: "2025/26", complete: true, latestMatchDate: null, players: new Map([[500, mine], [2, row(1800, 3)], [3, row(1800, 1)]]), clubs: new Map() }]]),
    liveSeason: "2026/27",
    positionByCode: new Map([[500, "MID"], [2, "MID"], [3, "MID"]]),
    clubCodeByPlayerCode: new Map(),
  });
  const view = { mode: "lastSeason" as const, seasons: ["2025/26"] };
  const tintOf = (label: HTMLElement) => label.closest<HTMLElement>(".stat-tile")!.style.getPropertyValue("--tile-tint");
  /** A Summary tile's label (the shot panel has some of the same names). */
  const tile = (container: HTMLElement, label: string) => [...container.querySelectorAll<HTMLElement>(".stat-tile-label")].find((l) => l.textContent === label)!;

  it("comes first, before the shot maps, with his position's groups, coloured within his position", () => {
    const p = createProfiles(new Map([[playerKey(500, "2025/26"), playerDetail([])]]), noop, compare(row(1800, 5)));
    const { container } = render(<>{p.playerCards(500, view, "MID")}</>);
    expect([...container.querySelectorAll(".card > .card-title")].map((t) => t.textContent)).toEqual(["Summary", "Shot Map · Taken"]);
    expect([...container.querySelectorAll(".stat-group-title")].map((t) => t.textContent)).toEqual(["Offensive", "Creating", "Actual vs Expected", "Shooting"]);
    expect(tile(container, "xG").nextSibling!.textContent).toBe("5.00");
    // The most xG of three: (2 + ½) ÷ 3.
    expect(tintOf(tile(container, "xG"))).toBe(percentileTint((2.5 / 3) * 100));
  });

  it("under the floor: no colours, and the stopwatch on its title says why", () => {
    const p = createProfiles(new Map([[playerKey(500, "2025/26"), playerDetail([])]]), noop, compare(row(300, 5)));
    const { container, getByText } = render(<>{p.playerCards(500, view, "MID")}</>);
    expect(tintOf(tile(container, "xG"))).toBe("");
    expect(getByText("Summary").closest(".card-title")!.querySelector(".small-sample-badge")!.getAttribute("title")).toMatch(/^Small sample/);
  });

  it("nothing from Understat for the view: one card says so, not one per card", () => {
    const empty: UsComparisonContext = { ...compare(row(1800, 5)), seasons: new Map() };
    const p = createProfiles(new Map([[playerKey(500, "2025/26"), { state: "none" }]]), noop, empty);
    const { getAllByText, container } = render(<>{p.playerCards(500, view, "DEF")}</>);
    expect(getAllByText(/No Understat record/)).toHaveLength(1);
    expect(container.querySelectorAll(".card")).toHaveLength(1);
  });
});
