import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { dutyHint, setPieceDuties, SetPieceDutyIcons } from "./SetPieceDuties";
import { makePlayer } from "../test/fixtures";

// <set_piece_duties>: FPL's set-piece lists as icons after a player's name.

describe("set-piece duty icons", () => {
  it("one per duty he's in his club's first three for; none past third or off the list", () => {
    expect(setPieceDuties(makePlayer({ id: 1, position: "MID", penaltiesOrder: 1, directFreekicksOrder: 3, cornersOrder: 2 }))).toEqual([
      { duty: "penalties", order: 1 },
      { duty: "directFreekicks", order: 3 },
      { duty: "corners", order: 2 },
    ]);
    expect(setPieceDuties(makePlayer({ id: 2, position: "MID", penaltiesOrder: 4, directFreekicksOrder: null, cornersOrder: null }))).toEqual([]);
  });

  it("gold, silver and bronze by his place, each saying on hover what it means for him", () => {
    const p = makePlayer({ id: 3, position: "MID", teamName: "Arsenal", penaltiesOrder: 2, cornersOrder: 1 });
    const { container } = render(<SetPieceDutyIcons player={p} />);
    const icons = [...container.querySelectorAll(".duty-icon")];
    expect(icons.map((i) => i.className)).toEqual(["duty-icon duty-2", "duty-icon duty-1"]);
    expect(icons[0].getAttribute("title")).toBe(dutyHint({ duty: "penalties", order: 2 }, "Arsenal"));
    expect(icons[0].getAttribute("title")).toMatch(/^Penalties: second choice for Arsenal\. .*when the first choice is off the pitch/);
    expect(icons[1].getAttribute("title")).toMatch(/^Corners and indirect free kicks: first choice for Arsenal\./);
  });

  it("draws nothing for a player with no duties", () => {
    const { container } = render(<SetPieceDutyIcons player={makePlayer({ id: 4, position: "DEF" })} />);
    expect(container.innerHTML).toBe("");
  });
});
