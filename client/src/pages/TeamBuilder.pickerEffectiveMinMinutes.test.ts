import { describe, it, expect } from "vitest";
import { pickerEffectiveMinMinutes } from "./TeamBuilder";

describe("pickerEffectiveMinMinutes — M6 regression: Team Building's Add Players Min Minutes filter must bypass in live mode", () => {
  it("bypasses (returns null) in live mode regardless of the set threshold", () => {
    expect(pickerEffectiveMinMinutes("live", 900)).toBeNull();
  });

  it("bypasses in live mode even when no threshold was set", () => {
    expect(pickerEffectiveMinMinutes("live", null)).toBeNull();
  });

  it("applies the threshold as-is in lastSeason mode", () => {
    expect(pickerEffectiveMinMinutes("lastSeason", 900)).toBe(900);
  });

  it("applies the threshold as-is in historicAverage mode", () => {
    expect(pickerEffectiveMinMinutes("historicAverage", 450)).toBe(450);
  });

  it("stays null (no filter) in a non-live mode when the user never set one", () => {
    expect(pickerEffectiveMinMinutes("lastSeason", null)).toBeNull();
  });
});
