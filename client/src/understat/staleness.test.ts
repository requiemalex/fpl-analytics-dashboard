import { describe, expect, it } from "vitest";
import { understatMatchesBehind } from "./staleness";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const fx = (kickoffTime: string, finished = true) => ({ kickoffTime, finished });

describe("Understat 'behind' note (audit 2026-10-18 M18)", () => {
  it("counts finished FPL matches 2+ days old that are after Understat's latest match, even when the sync recorded nothing missing (it stopped writing)", () => {
    const fixtures = [fx("2026-10-17T14:00:00Z"), fx("2026-10-25T14:00:00Z"), fx("2026-10-29T19:00:00Z"), fx("2026-11-01T15:00:00Z", false)];
    // Understat's copy stops at 17 Oct: the 25 Oct match is behind; 29 Oct is under 2 days old.
    expect(understatMatchesBehind(fixtures, "2026-10-17", {}, NOW)).toBe(1);
  });
  it("is 0 when Understat has every finished match", () => {
    expect(understatMatchesBehind([fx("2026-10-25T14:00:00Z")], "2026-10-25", {}, NOW)).toBe(0);
  });
  it("still counts what the sync itself recorded as missing", () => {
    expect(understatMatchesBehind([], "2026-10-25", { "71": "2026-10-26" }, NOW)).toBe(1);
  });
});
