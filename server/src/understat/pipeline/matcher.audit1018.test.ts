import { describe, expect, it } from "vitest";
import { linkSeason } from "./matcher.js";
import type { PlayerLink } from "./types.js";

/**
 * types.ts: overrides.csv "never" forbids a link, applied on every run.
 * An existing confirmed link that the owner marks "never" must stop being
 * confirmed (so the app hides it), not stay live.
 */
describe("overrides.csv never on an existing confirmed link", () => {
  it.fails("[UNDERSTAT-NEVER] a 'never' override un-confirms a saved wrong link", () => {
    const matchByFixture = new Map([
      [1, "m1"],
      [2, "m2"],
      [3, "m3"],
    ]);
    const link: PlayerLink = {
      fplCode: 100,
      understatId: "u9",
      status: "confirmed",
      fplName: "Gabriel Magalhaes",
      understatName: "Gabriel Martinelli",
      season: "2026/27",
      since: "2026-10-01",
      note: "2026/27: names and 3 appearances agree",
    };
    const result = linkSeason({
      season: "2026/27",
      today: "2026-10-18",
      fpl: [{ code: 100, name: { first: "Gabriel", second: "Magalhaes", web: "Gabriel" }, minutesByFixture: new Map([[1, 90], [2, 90], [3, 90]]), teamIds: new Set([1]) }],
      us: [{ id: "u9", name: "Gabriel Martinelli", minutesByMatch: new Map([["m1", 88], ["m2", 85], ["m3", 90]]), teamIds: new Set(["t1"]) }],
      matchByFixture,
      teamByFplId: new Map([[1, "t1"]]),
      links: new Map([[100, link]]),
      overrides: [{ fplCode: 100, understatId: "u9", action: "never", note: "wrong Gabriel" }],
    });
    const now = result.links.get(100);
    expect(now?.status === "confirmed" && now.understatId === "u9").toBe(false);
  });
});
