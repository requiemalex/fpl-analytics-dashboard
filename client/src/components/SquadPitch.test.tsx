import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SquadPitch, projectedPoints, type PitchColourRanks } from "./SquadPitch";
import { percentileTint } from "../utils/colorScale";
import { openSquadSlots, validateSquad } from "../metrics/squadRules";
import { makePlayer } from "../test/fixtures";
import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";
import type { GameweekExpectation } from "../metrics/gameweekExpectations";
import type { ModelBreakdown } from "../metrics/pointsModel";
import type { FplBreakdown } from "../metrics/expectedPoints";

afterEach(cleanup);

const fixture = (id: number, opponent: string, isHome: boolean, difficulty = 2, eventId = 9): UpcomingFixture => ({ fixtureId: id, eventId, opponentTeamId: 99, opponentShortName: opponent, isHome, difficulty });

/** An FPL Official figure for one match (<fpl_official>): `total` points, with no season record to go on unless `seasonRate` is given. */
const fplMatch = (total: number, o: Partial<FplBreakdown> = {}): FplBreakdown => ({ total, epNext: total, seasonRate: null, formShare: 1, availability: 1, multiplier: 1, ...o });

// The next gameweek is GW9: one match v BUR, FPL 4.2, no Model figure.
const nextGameweek = (): GameweekExpectation => ({ eventId: 9, fixtures: [fixture(1, "BUR", true)], fplBreakdowns: [fplMatch(4.2)], fpl: 4.2, modelBreakdowns: null, model: null, expectedMinutes: null });

/** A Model figure for one match: `total` points, `minutes` expected. */
const modelMatch = (total: number, minutes: number, startChance = 0.9) => ({ total, expectedMinutes: minutes, startChance, notes: [] }) as unknown as ModelBreakdown;

function renderPitch(
  xi: NormalizedPlayer[],
  bench: NormalizedPlayer[] = [],
  onAddSlot = vi.fn(),
  captainId: number | null = null,
  hasSquad = true,
  captainPickMode: "captain" | "viceCaptain" | null = null,
  gameweeks = [9, 10, 11, 12, 13],
  extra: {
    expectations?: Map<number, GameweekExpectation | null>;
    gameweek?: number | null;
    onGameweekChange?: (eventId: number) => void;
    onBestDraft?: (picks: unknown) => void;
    purchasePrices?: Record<number, number>;
    colourRanks?: PitchColourRanks;
  } = {},
) {
  const squad = [...xi, ...bench];
  const groups = Object.fromEntries((["GKP", "DEF", "MID", "FWD"] as Position[]).map((pos) => [pos, xi.filter((p) => p.position === pos)])) as Record<Position, NormalizedPlayer[]>;
  const utils = render(
    <SquadPitch
      squadName="My Squad"
      squadValidation={validateSquad(squad)}
      positionGroups={groups}
      benchPlayers={bench}
      openSlots={openSquadSlots(squad, xi)}
      captainId={captainId}
      viceCaptainId={null}
      gameweeks={gameweeks}
      gameweek={extra.gameweek === undefined ? (gameweeks[0] ?? null) : extra.gameweek}
      onGameweekChange={extra.onGameweekChange ?? (() => {})}
      expectationByPlayerId={extra.expectations ?? new Map(squad.map((p) => [p.id, nextGameweek()]))}
      purchasePrices={extra.purchasePrices ?? {}}
      purchaseUnknownHint="Purchase price not known"
      colourRanks={extra.colourRanks ?? {}}
      fixturesByTeamId={new Map([[1, [fixture(1, "BUR", true), fixture(2, "WOL", false, 4)]]])}
      captainPickMode={captainPickMode}
      onCaptainTileClick={() => {}}
      onPlayerCardClick={() => {}}
      onViewProfile={() => {}}
      onSwap={() => {}}
      onAddToPitch={() => {}}
      onBench={() => {}}
      onRemove={() => {}}
      onAddSlot={onAddSlot}
      onClearSquad={() => {}}
      onBestDraft={extra.onBestDraft ?? (() => {})}
      warning={null}
      hasSquad={hasSquad}
      budgetHint=""
    />,
  );
  return { ...utils, onAddSlot };
}

describe("<open_slots> the pitch's empty places", () => {
  it("an empty squad shows a 4-4-2 of + places and a bench of four", () => {
    const { container } = renderPitch([]);
    const labels = (scope: string) => [...container.querySelectorAll(`${scope} .pitch-slot-label`)].map((l) => l.textContent);
    expect(labels(".pitch")).toEqual(["FWD", "FWD", "MID", "MID", "MID", "MID", "DEF", "DEF", "DEF", "DEF", "GKP"]);
    expect(labels(".bench-strip")).toEqual(["GKP", "DEF", "MID", "FWD"]);
  });

  it("a + place asks for its position", () => {
    const { getAllByRole, onAddSlot } = renderPitch([]);
    fireEvent.click(getAllByRole("button", { name: /^Add a goalkeeper/ })[0]);
    expect(onAddSlot).toHaveBeenCalledWith("GKP");
  });

  it("a filled place is a kit, not a + place", () => {
    const { container } = renderPitch([makePlayer({ id: 1, position: "GKP" })]);
    expect(container.querySelectorAll(".pitch .pitch-card")).toHaveLength(1);
    expect(container.querySelectorAll(".pitch .pitch-slot-open")).toHaveLength(10);
  });
});

describe("<kit_view> Highlight", () => {
  it("shows one figure for the next match, with no fixture beside it, and switches what it is", () => {
    const { container, getByRole, queryByRole } = renderPitch([makePlayer({ id: 1, position: "MID", price: 7.5 })]);
    const figure = () => container.querySelector(".pitch-card .pitch-card-figure")?.textContent;
    // Points Prediction, FPL, by default.
    expect(figure()).toBe("4.2");
    expect(container.querySelector(".pitch-card .pitch-card-match")).toBeNull();
    expect(container.querySelector(".pitch-card .pitch-card-figure")!.getAttribute("title")).toBe("FPL figures v BUR (H): 4.2 pts. FPL's own expected points (his form) alone: no season record of his to go on yet");
    // Its toggle picks the Model, which has no figure for him here.
    fireEvent.click(getByRole("radiogroup", { name: "Source" }).querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    expect(figure()).toBe("—");
    fireEvent.click(getByRole("radio", { name: /^Price:/ }));
    expect(figure()).toBe("£7.5m");
    // The Source toggle stays (Projected Points and Best Draft follow it in every view); Price adds its own.
    expect(getByRole("radiogroup", { name: "Source" })).toBeTruthy();
    expect(getByRole("radiogroup", { name: "Price" })).toBeTruthy();
    fireEvent.click(getByRole("radio", { name: /^Expected minutes/ }));
    expect(queryByRole("radiogroup", { name: "Price" })).toBeNull();
    fireEvent.click(getByRole("radio", { name: /next five matches/ }));
    expect(figure()).toBeUndefined();
    expect([...container.querySelectorAll(".pitch-card .pitch-card-fixture")].map((c) => c.textContent)).toEqual(["BUR", "WOL"]);
  });

  it("lists Points Prediction last", () => {
    const { getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    const labels = [...getByRole("radiogroup", { name: "Highlight" }).querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Fixtures", "Price", "Owned", "Minutes", "Points Prediction"]);
  });

  it("has no Match switch", () => {
    const { queryByText } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    expect(queryByText("Match")).toBeNull();
    expect(queryByText("GW10", { selector: "button" })).toBeNull();
  });
});

describe("the squad's heading", () => {
  it("is just its name: no formation or player count", () => {
    const { container } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    expect(container.querySelector(".pitch-view-heading")!.textContent).toBe("My Squad");
  });
});

describe("the squad's actions", () => {
  it("an armed Captain button is green, with no instructions under the pitch controls", () => {
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, "captain");
    expect(getByRole("button", { name: "Captain" }).className).toBe("btn active");
    expect(container.textContent).not.toMatch(/Click a starting player/);
  });

  it("Captain, Vice-Captain, Clear Draft and Best Draft are the app's standard buttons", () => {
    const { getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    for (const name of ["Captain", "Vice-Captain", "Clear Draft", "Best Draft"]) {
      expect(getByRole("button", { name }).className).toBe("btn");
    }
  });
});

describe("with no squad loaded", () => {
  it("the whole tile is greyed out and inert, so no player can be added", () => {
    const onAddSlot = vi.fn();
    const { container, getAllByRole } = renderPitch([], [], onAddSlot, null, false);
    const root = container.firstElementChild!;
    expect(root.classList.contains("is-disabled")).toBe(true);
    expect(root.hasAttribute("inert")).toBe(true);
    const slot = getAllByRole("button", { name: /^Add a goalkeeper/ })[0];
    expect(slot).toHaveProperty("disabled", true);
    fireEvent.click(slot);
    expect(onAddSlot).not.toHaveBeenCalled();
  });

  it("and comes back to life once there is one", () => {
    const { container } = renderPitch([]);
    expect(container.firstElementChild!.hasAttribute("inert")).toBe(false);
  });
});

describe("<club_kit> kits", () => {
  it("wear the club's colours, the goalkeeper's swapped", () => {
    const ars = { teamId: 1, teamShortName: "ARS" };
    const { container } = renderPitch([makePlayer({ id: 1, position: "GKP", ...ars }), makePlayer({ id: 2, position: "DEF", ...ars })]);
    const bodies = [...container.querySelectorAll<SVGPathElement>(".pitch-card .kit-svg path:first-of-type")].map((p) => p.style.fill);
    // Rows run forwards first, so the defender comes before the goalkeeper.
    expect(bodies).toEqual(["#EF0107", "#F5F5F5"]);
  });
});

describe("Projected Team Points", () => {
  it("is gone: the squad's tiles are Squad Value and Bank", () => {
    const { container, queryByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    expect(queryByRole("group", { name: "Projected Team Points" })).toBeNull();
    expect([...container.querySelectorAll(".pitch-view-tiles .stat-tile-label")].map((l) => l.textContent)).toEqual(["Squad Value", "Bank"]);
  });
});

describe("<gameweek_arrows> the pitch's gameweek", () => {
  it("steps through the upcoming gameweeks, by FPL's numbering, and stops at either end", () => {
    const onGameweekChange = vi.fn();
    const { getByRole, container } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, null, [9, 10, 11], { onGameweekChange });
    expect(container.querySelector(".gameweek-arrows-value")!.textContent).toBe("GW9");
    expect(getByRole("button", { name: "Previous gameweek" })).toHaveProperty("disabled", true);
    fireEvent.click(getByRole("button", { name: "Next gameweek" }));
    expect(onGameweekChange).toHaveBeenCalledWith(10);
    cleanup();
    const last = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, null, [9, 10, 11], { gameweek: 11, onGameweekChange });
    expect(last.getByRole("button", { name: "Next gameweek" })).toHaveProperty("disabled", true);
    fireEvent.click(last.getByRole("button", { name: "Previous gameweek" }));
    expect(onGameweekChange).toHaveBeenLastCalledWith(10);
  });

  it("shows — with no gameweek left this season", () => {
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, null, [], { gameweek: null });
    expect(container.querySelector(".gameweek-arrows-value")!.textContent).toBe("—");
    expect(getByRole("button", { name: "Next gameweek" })).toHaveProperty("disabled", true);
  });

  it("the cards show the gameweek given: its points and its expected minutes", () => {
    const gw10: GameweekExpectation = {
      eventId: 10,
      fixtures: [fixture(3, "WOL", false, 4, 10)],
      fplBreakdowns: [fplMatch(6.1, { epNext: 5, seasonRate: 7.2, formShare: 0.2, availability: 0.75, multiplier: 0.9 })],
      fpl: 6.1, modelBreakdowns: [modelMatch(5.2, 77.6, 0.88)], model: 5.2, expectedMinutes: 77.6 };
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, null, [9, 10], { gameweek: 10, expectations: new Map([[1, gw10]]) });
    const figure = () => container.querySelector(".pitch-card .pitch-card-figure")!;
    expect(figure().textContent).toBe("6.1");
    expect(figure().getAttribute("title")).toBe(
      "FPL figures v WOL (A): 6.1 pts. Season 7.2 a match (goals and assists partly as xG and xA), counting 80%; form 5.0 (FPL's own expected points), counting 20%; −10% for FPL difficulty 4; 75% chance of playing",
    );
    fireEvent.click(getByRole("radio", { name: /^Expected minutes/ }));
    // <whole_numbers>: minutes are whole.
    expect(figure().textContent).toBe("78");
    expect(figure().getAttribute("title")).toBe("About 78 minutes expected in GW10 v WOL (A): 88% chance of starting");
  });
});

describe("<expected_minutes> Minutes", () => {
  it("adds up a double gameweek's matches, and a blank has no figure", () => {
    const double: GameweekExpectation = {
      eventId: 9,
      fixtures: [fixture(1, "BUR", true), fixture(2, "WOL", false)],
      fplBreakdowns: [fplMatch(4), fplMatch(4)],
      fpl: 8,
      modelBreakdowns: [modelMatch(4, 80), modelMatch(3, 62, 0.7)],
      model: 7,
      expectedMinutes: 142,
    };
    const blank: GameweekExpectation = { eventId: 9, fixtures: [], fplBreakdowns: null, fpl: null, modelBreakdowns: null, model: null, expectedMinutes: null };
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" }), makePlayer({ id: 2, position: "FWD" })], [], vi.fn(), null, true, null, [9], {
      expectations: new Map([
        [1, double],
        [2, blank],
      ]),
    });
    fireEvent.click(getByRole("radio", { name: /^Expected minutes/ }));
    // Forwards are drawn first.
    const [fwd, mid] = [...container.querySelectorAll(".pitch-card .pitch-card-figure")];
    expect(mid.textContent).toBe("142");
    expect(mid.getAttribute("title")).toBe("About 142 minutes expected in GW9\nv BUR (H): about 80, 90% chance of starting\nv WOL (A): about 62, 70% chance of starting");
    expect(fwd.textContent).toBe("—");
    expect(fwd.getAttribute("title")).toBe("No match in GW9");
  });
});

describe("<price_view> Price", () => {
  const progress = (percent: number, projected: number, likelihood: number) => ({ percent, projections: [{ offsetDays: 0, projectedPercent: projected, likelihood }], lockedUntil: null, calibrating: false });
  const priced = (colourRanks: PitchColourRanks = {}) =>
    renderPitch(
      [
        makePlayer({ id: 1, position: "MID", price: 7.9, priceChange: progress(100.2, 102.7, 5) }),
        makePlayer({ id: 2, position: "FWD", price: 7.1, priceChange: progress(-96.1, -97, -4) }),
      ],
      [makePlayer({ id: 3, position: "DEF", price: 4.5, priceChange: { ...progress(3, 4, 1), lockedUntil: "2026-10-29T01:30:00Z" } })],
      vi.fn(),
      null,
      true,
      null,
      [9],
      { purchasePrices: { 1: 7.4, 3: 4.5 }, colourRanks },
    );
  const figures = (container: HTMLElement) => [...container.querySelectorAll(".pitch-card .pitch-card-figure")].map((f) => ({ text: f.textContent, title: f.getAttribute("title") }));

  it("toggles between today's price, the purchase price and the selling price", () => {
    const { container, getByRole } = priced();
    fireEvent.click(getByRole("radio", { name: /^Price:/ }));
    expect([...getByRole("radiogroup", { name: "Price" }).querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Current", "Purchase", "Sell", "Progress", "Predicted Progress"]);
    // Forward (id 2) first, then the midfielder (id 1), then the bench defender (id 3).
    expect(figures(container).map((f) => f.text)).toEqual(["£7.1m", "£7.9m", "£4.5m"]);
    fireEvent.click(getByRole("radio", { name: /^Selling price/ }));
    // Bought for £7.4m, now £7.9m: FPL keeps half the £0.5m rise, rounded down. The forward's purchase price isn't known.
    // Bought at today's price, the defender sells for it too.
    expect(figures(container)).toEqual([
      { text: "—", title: "Purchase price not known" },
      { text: "£7.6m", title: "Sells for £7.6m: bought for £7.4m, £7.9m today (FPL keeps half of a rise, rounded down to £0.1m)" },
      { text: "£4.5m", title: "Sells for £4.5m: bought for £4.5m, £4.5m today (FPL keeps half of a rise, rounded down to £0.1m)" },
    ]);
    fireEvent.click(getByRole("radio", { name: /^Purchase price/ }));
    expect(figures(container).map((f) => f.text)).toEqual(["—", "£7.4m", "£4.5m"]);
  });

  it("colours purchase and selling prices by their rank within the position, lower greener, as today's price", () => {
    const { container, getByRole } = priced({ purchase: new Map([[1, 90]]), sell: new Map([[1, 20]]) });
    fireEvent.click(getByRole("radio", { name: /^Price:/ }));
    const mid = () => container.querySelectorAll<HTMLElement>(".pitch-card .pitch-card-figure")[1];
    fireEvent.click(getByRole("radio", { name: /^Purchase price/ }));
    expect(mid().style.background).toBe(asRendered(percentileTint(90)));
    fireEvent.click(getByRole("radio", { name: /^Selling price/ }));
    expect(mid().style.background).toBe(asRendered(percentileTint(20)));
  });

  it("<price_progress> shows FPL's Progress and Predicted Progress, coloured grey to full green or red by the figure, and says when a price is locked", () => {
    const { container, getByRole } = priced();
    fireEvent.click(getByRole("radio", { name: /^Price:/ }));
    fireEvent.click(getByRole("radio", { name: /^Progress:/ }));
    const [fwd, mid, def] = figures(container);
    expect(mid).toEqual({
      text: "+100.2%",
      title: "Progress +100.2%: FPL's figure for how far he is toward a rise (100% is the threshold). Predicted at the next update: +102.7%, very likely to rise.",
    });
    expect(fwd.text).toBe("−96.1%");
    expect(def.text).toBe("Locked");
    expect(def.title).toMatch(/^FPL has locked his price until /);
    const cards = () => container.querySelectorAll<HTMLElement>(".pitch-card .pitch-card-figure");
    // +100.2% is full green; −96.1% nearly full red.
    expect(cards()[1].style.background).toBe(asRendered(percentileTint(100)));
    expect(cards()[0].style.background).toBe(asRendered(percentileTint(50 - 96.1 / 2)));
    fireEvent.click(getByRole("radio", { name: /^Predicted Progress:/ }));
    expect(figures(container)[0]).toEqual({
      text: "−97.0%",
      title: "Predicted Progress −97.0%: where FPL expects him to be toward a drop at the next price update, likely to drop. Now −96.1%.",
    });
  });
});

/** A CSS background as the browser stores it. */
function asRendered(css: string | undefined): string {
  const el = document.createElement("div");
  if (css) el.style.background = css;
  return el.style.background;
}

describe("<best_draft> Best Draft", () => {
  /** A full 15 (2 GKP, 5 DEF, 5 MID, 3 FWD), ids 1–15, with GW9 figures; the first 11 start. */
  function fullSquad(points: number[]) {
    const positions: Position[] = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
    const all = positions.map((position, i) => makePlayer({ id: i + 1, position }));
    const expectations = new Map(all.map((p, i) => [p.id, { ...nextGameweek(), fplBreakdowns: [fplMatch(points[i])], fpl: points[i], model: points[i] / 2 } as GameweekExpectation]));
    // Starting: 1 GKP, 4 DEF, 4 MID, 2 FWD.
    const xi = [all[0], all[2], all[3], all[4], all[5], all[7], all[8], all[9], all[10], all[12], all[13]];
    const bench = all.filter((p) => !xi.includes(p));
    return { xi, bench, expectations };
  }

  it("sits to the right of Clear Draft and puts the XI and armbands with the most points in place", () => {
    const onBestDraft = vi.fn();
    // The bench goalkeeper (2) and third forward (15) are better than their starters.
    const { xi, bench, expectations } = fullSquad([2, 5, 3, 3, 3, 3, 1, 4, 4, 4, 4, 1, 6, 2, 7]);
    const { container, getByRole } = renderPitch(xi, bench, vi.fn(), null, true, null, [9], { expectations, onBestDraft });
    expect([...container.querySelectorAll(".pitch-view-actions button")].map((b) => b.textContent)).toEqual(["Captain", "Vice-Captain", "Clear Draft", "Best Draft"]);
    const button = getByRole("button", { name: "Best Draft" });
    expect(button.getAttribute("title")).toBe("Pick the starting XI, captain and vice-captain with the most Exp. Pts (FPL Official) in GW9, in a formation FPL allows");
    fireEvent.click(button);
    const picks = onBestDraft.mock.calls[0][0] as { startingXI: number[]; captainId: number; viceCaptainId: number };
    expect([...picks.startingXI].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 15]);
    expect(picks.captainId).toBe(15);
    expect(picks.viceCaptainId).toBe(13);
  });

  it("uses Points Prediction's source", () => {
    const onBestDraft = vi.fn();
    const { xi, bench, expectations } = fullSquad([2, 5, 3, 3, 3, 3, 1, 4, 4, 4, 4, 1, 6, 2, 7]);
    const { getByRole } = renderPitch(xi, bench, vi.fn(), null, true, null, [9], { expectations, onBestDraft });
    fireEvent.click(getByRole("radiogroup", { name: "Source" }).querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    expect(getByRole("button", { name: "Best Draft" }).getAttribute("title")).toContain("Exp. Pts (Model Predicted) in GW9");
  });

  it("is greyed out, saying why, until the squad can make a legal XI", () => {
    const { getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    const button = getByRole("button", { name: "Best Draft" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("title")).toMatch(/^Needs players for a legal starting XI/);
  });
});

describe("<projected_points> projectedPoints", () => {
  const mid = (id: number, name: string) => makePlayer({ id, name, position: "MID" });
  const gw = (fpl: number | null, matches = 1): GameweekExpectation => ({ ...nextGameweek(), fixtures: matches ? [fixture(1, "BUR", true)] : [], fplBreakdowns: null, fpl });
  const xi = [mid(1, "A"), mid(2, "B"), mid(3, "C")];

  it("adds up the starting XI, the captain's counted twice, a blank counting 0; the bench apart", () => {
    const figures = new Map([
      [1, gw(4)],
      [2, gw(null, 0)],
      [3, gw(2.5)],
      [4, gw(1.5)],
    ]);
    const p = projectedPoints(xi, [mid(4, "D")], 1, figures, "fpl");
    expect(p.total).toBe(10.5);
    expect(p.captain).toEqual({ name: "A", points: 8 });
    expect(p.bench).toBe(1.5);
  });
  it("has no total while a starter with a match has no figure, and names him", () => {
    const p = projectedPoints(xi, [], null, new Map([[1, gw(4)], [2, gw(null)], [3, gw(1)]]), "fpl");
    expect(p.total).toBeNull();
    expect(p.missing).toEqual(["B"]);
    expect(projectedPoints([], [], null, new Map(), "fpl").total).toBeNull();
  });
  it("shows on the pitch beside the squad's figures, following the Source toggle", () => {
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), 1);
    expect(container.querySelector(".projected-box-value")!.textContent).toBe("8.4");
    expect(container.querySelector(".projected-box-tag")!.textContent).toBe("GW9 · FPL");
    fireEvent.click(getByRole("radiogroup", { name: "Source" }).querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    expect(container.querySelector(".projected-box-value")!.textContent).toBe("—");
  });
});
