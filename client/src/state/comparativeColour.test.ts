import { describe, it, expect, vi, afterEach } from "vitest";

// <comparative_colour_switch>: the top bar's one switch for every
// comparative colour. Each test imports fresh modules, so the setting is
// read from localStorage as on a fresh start.

const KEY = "scoutline:comparative-colour:v1";

async function load() {
  vi.resetModules();
  const setting = await import("./comparativeColour");
  const scale = await import("../utils/colorScale");
  return { ...setting, ...scale };
}

afterEach(() => localStorage.clear());

describe("comparative colouring switch", () => {
  it("is on by default, and the painting functions colour as usual", async () => {
    const { isComparativeColourOn, percentileTint, percentileColour } = await load();
    expect(isComparativeColourOn()).toBe(true);
    expect(percentileTint(90)).toMatch(/^rgba\(63,191,127,/);
    expect(percentileColour(10)).toMatch(/^rgb\(/);
  });

  it("switched off, no figure anywhere gets a colour, green or red", async () => {
    const { setComparativeColourOn, percentileTint, percentileColour } = await load();
    setComparativeColourOn(false);
    for (const p of [0, 10, 90, 100]) {
      expect(percentileTint(p)).toBeUndefined();
      expect(percentileColour(p)).toBeUndefined();
    }
    setComparativeColourOn(true);
    expect(percentileTint(90)).toBeDefined();
  });

  it("is kept across restarts", async () => {
    (await load()).setComparativeColourOn(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, data: false });
    const { isComparativeColourOn, percentileTint } = await load();
    expect(isComparativeColourOn()).toBe(false);
    expect(percentileTint(90)).toBeUndefined();
  });

  it("an unreadable saved value falls back to on", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, data: "off" }));
    expect((await load()).isComparativeColourOn()).toBe(true);
  });
});
