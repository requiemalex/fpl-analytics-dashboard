import { describe, it, expect } from "vitest";
import { detectAdvancedFieldAvailability } from "./fieldAvailability";
import { makeRawElement } from "../test/rawFixtures";

describe("detectAdvancedFieldAvailability", () => {
  it("marks a field present when every element has it", () => {
    const elements = [makeRawElement({ id: 1, expected_goals: "1.0" }), makeRawElement({ id: 2, expected_goals: "2.0" })];
    const result = detectAdvancedFieldAvailability(elements);
    expect(result.expected_goals).toBe(true);
  });

  it("marks a field present if only SOME elements have the key at all (e.g. keepers vs outfield players) — 'hasOwnProperty', not 'is non-null'", () => {
    const elements = [
      makeRawElement({ id: 1 }), // no expected_goals key at all
      makeRawElement({ id: 2, expected_goals: null }), // key present but null (e.g. a keeper)
    ];
    const result = detectAdvancedFieldAvailability(elements);
    // Object.assign via spread does NOT set a key for `undefined` unless explicitly passed;
    // element 2 explicitly has the key (value null), so hasOwnProperty is true for it.
    expect(result.expected_goals).toBe(true);
  });

  it("marks a field absent when NO element has the key at all", () => {
    const elements = [makeRawElement({ id: 1 }), makeRawElement({ id: 2 })];
    const result = detectAdvancedFieldAvailability(elements);
    expect(result.expected_goals).toBe(false);
    expect(result.defensive_contribution).toBe(false);
    expect(result.price_change_percent).toBe(false);
  });

  it("detects each candidate field independently — one present, others absent", () => {
    // Note: the fixture's `starts`/`starts_per_90` are always present since
    // RawElement types them as required (non-optional) — this test uses
    // genuinely optional candidate fields (expected_assists, transfers_in)
    // to exercise the "absent" branch instead.
    const elements = [makeRawElement({ id: 1, form: "5.0" })];
    const result = detectAdvancedFieldAvailability(elements);
    expect(result.form).toBe(true);
    expect(result.expected_assists).toBe(false);
    expect(result.transfers_in).toBe(false);
  });

  it("scans the whole element list, not just the first element, to catch a field present only on later players", () => {
    const elements = [
      makeRawElement({ id: 1 }), // no defensive_contribution key
      makeRawElement({ id: 2 }), // no defensive_contribution key
      makeRawElement({ id: 3, defensive_contribution: 12 }), // present here only
    ];
    const result = detectAdvancedFieldAvailability(elements);
    expect(result.defensive_contribution).toBe(true);
  });

  it("returns false for every field on an empty element list", () => {
    const result = detectAdvancedFieldAvailability([]);
    expect(result.expected_goals).toBe(false);
    expect(result.form).toBe(false);
    expect(result.price_change_calibrating).toBe(false);
  });
});
