import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SquadPitch } from "./SquadPitch";
import { openSquadSlots, validateSquad } from "../metrics/squadRules";
import { makePlayer } from "../test/fixtures";
import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";

afterEach(cleanup);

const fixture = (id: number, opponent: string, isHome: boolean, difficulty = 2): UpcomingFixture => ({ fixtureId: id, opponentTeamId: 99, opponentShortName: opponent, isHome, difficulty });

function renderPitch(xi: NormalizedPlayer[], bench: NormalizedPlayer[] = [], onAddSlot = vi.fn(), captainId: number | null = null, hasSquad = true, captainPickMode: "captain" | "viceCaptain" | null = null) {
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
      expectedPointsByPlayerId={new Map(squad.map((p) => [p.id, 4.2]))}
      modelBreakdownByPlayerId={new Map()}
      // FPL 4.2 a match (as on the cards); the Model 3, 2, 1, then no figure.
      projectionByPlayerId={new Map(squad.map((p) => [p.id, { fpl: [4.2, 4.2, 4.2, 4.2, 4.2], model: [3, 2, 1, null, null] }]))}
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
    expect(container.querySelector(".pitch-card .pitch-card-figure")!.getAttribute("title")).toContain("v BUR (H)");
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
    expect(queryByText("GW+2", { selector: "button" })).toBeNull();
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
    expect(figures()).toEqual(["GW+112.6", "GW+212.6", "GW+312.6", "GW+412.6", "GW+512.6"]);
    fireEvent.click(tile.querySelector<HTMLElement>('[aria-label^="Exp. Pts (Model"]')!);
    // 3, 2, 1 a starter (× 3 with the captain's doubled); matches 4 and 5 have no Model figure.
    expect(figures()).toEqual(["GW+19.0", "GW+26.0", "GW+33.0", "GW+4—", "GW+5—"]);
  });
});
