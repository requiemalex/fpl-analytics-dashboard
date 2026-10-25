import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SquadPitch } from "./SquadPitch";
import { openSquadSlots, validateSquad } from "../metrics/squadRules";
import { makePlayer } from "../test/fixtures";
import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";
import type { GameweekExpectation } from "../metrics/gameweekExpectations";

afterEach(cleanup);

const fixture = (id: number, opponent: string, isHome: boolean, difficulty = 2, eventId = 9): UpcomingFixture => ({ fixtureId: id, eventId, opponentTeamId: 99, opponentShortName: opponent, isHome, difficulty });

// The next gameweek is GW9: one match v BUR, FPL 4.2, no Model figure.
const nextGameweek = (): GameweekExpectation => ({ eventId: 9, fixtures: [fixture(1, "BUR", true)], fpl: 4.2, modelBreakdowns: null, model: null });

function renderPitch(
  xi: NormalizedPlayer[],
  bench: NormalizedPlayer[] = [],
  onAddSlot = vi.fn(),
  captainId: number | null = null,
  hasSquad = true,
  captainPickMode: "captain" | "viceCaptain" | null = null,
  gameweeks = [9, 10, 11, 12, 13],
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
      nextGameweekByPlayerId={new Map(squad.map((p) => [p.id, nextGameweek()]))}
      // FPL 4.2 a gameweek (as on the cards) but a blank in GW11; the Model 3, 2, (blank), then no figure.
      projectionByPlayerId={
        new Map(
          squad.map((p) => [
            p.id,
            { fpl: [4.2, 4.2, null, 4.2, 4.2].slice(0, gameweeks.length), model: [3, 2, null, null, null].slice(0, gameweeks.length), playing: [true, true, false, true, true].slice(0, gameweeks.length) },
          ]),
        )
      }
      reliabilityByPlayerId={new Map()}
      colourRanks={{}}
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
    expect(container.querySelector(".pitch-card .pitch-card-figure")!.getAttribute("title")).toBe("FPL's expected points for GW9 v BUR (H)");
    // Its toggle picks the Model, which has no figure for him here.
    fireEvent.click(getByRole("radiogroup", { name: "Source" }).querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    expect(figure()).toBe("—");
    fireEvent.click(getByRole("radio", { name: "Today's price" }));
    expect(figure()).toBe("£7.5m");
    // The toggle is Points Prediction's alone.
    expect(queryByRole("radiogroup", { name: "Source" })).toBeNull();
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

  it("Captain, Vice-Captain and Clear Draft are the app's standard buttons", () => {
    const { getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })]);
    for (const name of ["Captain", "Vice-Captain", "Clear Draft"]) {
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

describe("<squad_projection> the Projected tile", () => {
  it("totals the XI for each match on its own (captain doubled, bench left out), and its toggle picks the source", () => {
    const xi = [makePlayer({ id: 1, position: "MID" }), makePlayer({ id: 2, position: "FWD" })];
    const { getByRole } = renderPitch(xi, [makePlayer({ id: 3, position: "DEF" })], vi.fn(), 2);
    const tile = getByRole("group", { name: "Projected" });
    const figures = () => [...tile.querySelectorAll(".pitch-projected-match")].map((m) => m.textContent);
    expect(tile.querySelector(".stat-tile-label")!.textContent).toBe("Projected");
    // 4.2 + 4.2 × 2 in every match, never summed across them.
    // Labelled with FPL's own gameweek numbers. GW11 is the club's blank: nobody plays, so no total.
    expect(figures()).toEqual(["GW912.6", "GW1012.6", "GW11—", "GW1212.6", "GW1312.6"]);
    expect(tile.querySelectorAll<HTMLElement>(".pitch-projected-match")[2].title).toContain("2 starters have no match in GW11");
    fireEvent.click(tile.querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    // 3, 2, 1 a starter (× 3 with the captain's doubled); matches 4 and 5 have no Model figure.
    expect(figures()).toEqual(["GW99.0", "GW106.0", "GW11—", "GW12—", "GW13—"]);
  });

  it("shows only the gameweeks the season has left", () => {
    const { getByRole } = renderPitch([makePlayer({ id: 1, position: "MID" })], [], vi.fn(), null, true, null, [37, 38]);
    const labels = [...getByRole("group", { name: "Projected" }).querySelectorAll(".pitch-projected-gw")].map((l) => l.textContent);
    expect(labels).toEqual(["GW37", "GW38"]);
  });
});
