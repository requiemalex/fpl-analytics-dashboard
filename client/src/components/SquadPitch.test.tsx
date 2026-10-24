import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SquadPitch } from "./SquadPitch";
import { openSquadSlots, validateSquad } from "../metrics/squadRules";
import { makePlayer } from "../test/fixtures";
import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "../metrics/fixtureTicker";

afterEach(cleanup);

const fixture = (id: number, opponent: string, isHome: boolean, difficulty = 2): UpcomingFixture => ({ fixtureId: id, opponentTeamId: 99, opponentShortName: opponent, isHome, difficulty });

function renderPitch(xi: NormalizedPlayer[], bench: NormalizedPlayer[] = [], onAddSlot = vi.fn()) {
  const squad = [...xi, ...bench];
  const groups = Object.fromEntries((["GKP", "DEF", "MID", "FWD"] as Position[]).map((pos) => [pos, xi.filter((p) => p.position === pos)])) as Record<Position, NormalizedPlayer[]>;
  const utils = render(
    <SquadPitch
      squadName="My Squad"
      squadValidation={validateSquad(squad)}
      positionGroups={groups}
      benchPlayers={bench}
      openSlots={openSquadSlots(squad, xi)}
      captainId={null}
      viceCaptainId={null}
      expectedPointsByPlayerId={new Map(squad.map((p) => [p.id, 4.2]))}
      modelBreakdownByPlayerId={new Map()}
      reliabilityByPlayerId={new Map()}
      colourRanks={{}}
      fixturesByTeamId={new Map([[1, [fixture(1, "BUR", true), fixture(2, "WOL", false, 4)]]])}
      gwOffset={1}
      onGwOffsetChange={() => {}}
      captainPickMode={null}
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
      hasSquad
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

describe("<kit_view> Show on kits", () => {
  it("shows one figure beside the picked match, and switches what it is", () => {
    const { container, getByRole } = renderPitch([makePlayer({ id: 1, position: "MID", price: 7.5 })]);
    const figure = () => container.querySelector(".pitch-card .pitch-card-figure")?.textContent;
    expect(figure()).toBe("4.2");
    expect(container.querySelector(".pitch-card .pitch-card-match")!.textContent).toBe("BUR (H)");
    fireEvent.click(getByRole("radio", { name: "Today's price" }));
    expect(figure()).toBe("£7.5m");
    fireEvent.click(getByRole("radio", { name: /next five matches/ }));
    expect(figure()).toBeUndefined();
    expect([...container.querySelectorAll(".pitch-card .pitch-card-fixture")].map((c) => c.textContent)).toEqual(["BUR", "WOL"]);
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
