import { describe, it, expect } from "vitest";
import { availabilityModifier } from "./availability";

describe("availabilityModifier", () => {
  it("uses FPL's chance of playing when it publishes one", () => {
    expect(availabilityModifier({ status: "d", chanceOfPlayingNextRound: 75 })).toBe(0.75);
  });

  it("otherwise defaults by status: available 1, doubtful 0.5, injured/suspended/unavailable/on loan 0", () => {
    expect(availabilityModifier({ status: "a", chanceOfPlayingNextRound: null })).toBe(1);
    expect(availabilityModifier({ status: "d", chanceOfPlayingNextRound: null })).toBe(0.5);
    for (const status of ["i", "s", "u", "n"]) expect(availabilityModifier({ status, chanceOfPlayingNextRound: null })).toBe(0);
  });

  it("a missing status with no chance of playing is unknown, not 'available' (audit 2026-10-18 L4)", () => {
    expect(availabilityModifier({ status: "", chanceOfPlayingNextRound: null })).toBeNull();
  });
});
