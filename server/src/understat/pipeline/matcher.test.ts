import { describe, expect, it } from "vitest";
import { fingerprint, linkSeason, stillAgrees, type FplPlayerSeason, type UsPlayerSeason } from "./matcher.js";
import type { PlayerLink } from "./types.js";

const matchByFixture = new Map([1, 2, 3, 4, 5, 6].map((f) => [f, `m${f}`]));
const teamByFplId = new Map([[10, "T"]]);

function fplPlayer(code: number, first: string, second: string, web: string, minutes: Record<number, number>): FplPlayerSeason {
  return { code, name: { first, second, web }, minutesByFixture: new Map(Object.entries(minutes).map(([f, m]) => [Number(f), m])), teamIds: new Set([10]) };
}
function usPlayer(id: string, name: string, minutes: Record<number, number>): UsPlayerSeason {
  return { id, name, minutesByMatch: new Map(Object.entries(minutes).map(([f, m]) => [`m${f}`, m])), teamIds: new Set(["T"]) };
}
const full = (fixtures: number[], m = 90) => Object.fromEntries(fixtures.map((f) => [f, m]));

const run = (fpl: FplPlayerSeason[], us: UsPlayerSeason[], links = new Map<number, PlayerLink>(), overrides = [] as Parameters<typeof linkSeason>[0]["overrides"]) =>
  linkSeason({ season: "2026/27", today: "2026-10-18", fpl, us, matchByFixture, teamByFplId, links, overrides });

describe("fingerprint", () => {
  it("counts a substitute's appearance as agreeing despite stoppage time (FPL 45, Understat 36)", () => {
    const fp = fingerprint(new Map([[1, 45]]), new Map([["m1", 36]]), matchByFixture);
    expect(fp).toEqual({ agreement: 1, appearances: 1, mismatches: 0 });
  });
  it("ignores a stoppage-time cameo only one side lists", () => {
    const fp = fingerprint(new Map([[1, 90], [2, 3]]), new Map([["m1", 90]]), matchByFixture);
    expect(fp.mismatches).toBe(0);
  });
  it("only compares matches that are paired", () => {
    const fp = fingerprint(new Map([[1, 90], [99, 90]]), new Map([["m1", 90], ["m99", 90]]), matchByFixture);
    expect(fp.appearances).toBe(1);
  });
});

describe("linkSeason", () => {
  const gabriel = fplPlayer(1, "Gabriel", "dos Santos Magalhães", "Gabriel", full([1, 2, 3, 4, 5, 6]));
  const martinelli = fplPlayer(2, "Gabriel", "Martinelli Silva", "Martinelli", full([1, 2, 3, 4]));
  const bahoya = fplPlayer(3, "Jean-Mattéo", "Bahoya", "Bahoya", full([5, 6], 20));
  const usGabriel = usPlayer("u1", "Gabriel", full([1, 2, 3, 4, 5, 6]));
  const usMartinelli = usPlayer("u2", "Gabriel Martinelli", full([1, 2, 3, 4]));
  const usNegoce = usPlayer("u3", "Jean Négoce", full([5, 6], 20));

  it("links two players who share a first name by their appearances", () => {
    const { links } = run([gabriel, martinelli], [usGabriel, usMartinelli]);
    expect(links.get(1)).toMatchObject({ understatId: "u1", status: "confirmed" });
    expect(links.get(2)).toMatchObject({ understatId: "u2", status: "confirmed" });
  });

  it("links the only unlinked player left at a club whatever the names say (Bahoya / Jean Négoce)", () => {
    const { links, events } = run([gabriel, martinelli, bahoya], [usGabriel, usMartinelli, usNegoce]);
    expect(links.get(3)).toMatchObject({ understatId: "u3", status: "confirmed" });
    expect(events.some((e) => e.includes("only one left"))).toBe(true);
  });

  it("holds a name mismatch when more than one player is still unlinked at the club", () => {
    const other = fplPlayer(4, "Someone", "Else", "Else", full([5, 6], 20));
    const usOther = usPlayer("u4", "Totally Different", full([5, 6], 20));
    const { links } = run([bahoya, other], [usNegoce, usOther]);
    expect(links.get(3)?.status).toBe("held");
    expect(links.get(4)?.status).toBe("held");
  });

  it("disputes a saved link that stops agreeing, rather than re-pointing it", () => {
    const saved = new Map<number, PlayerLink>([
      [2, { fplCode: 2, understatId: "u1", status: "confirmed", fplName: "Gabriel Martinelli Silva", understatName: "Gabriel", season: "2025/26", since: "2025-09-01", note: "" }],
    ]);
    const { links } = run([martinelli], [usGabriel, usMartinelli], saved);
    expect(links.get(2)).toMatchObject({ understatId: "u1", status: "disputed" });
  });

  it("keeps a saved link that still agrees, and its date", () => {
    const saved = new Map<number, PlayerLink>([
      [1, { fplCode: 1, understatId: "u1", status: "confirmed", fplName: "Gabriel dos Santos Magalhães", understatName: "Gabriel", season: "2025/26", since: "2025-09-01", note: "" }],
    ]);
    const { links } = run([gabriel], [usGabriel], saved);
    expect(links.get(1)).toMatchObject({ understatId: "u1", status: "confirmed", since: "2025-09-01" });
  });

  it("never gives one Understat player to two FPL players", () => {
    const twin = fplPlayer(5, "Gabriel", "dos Santos", "Gabriel", full([1, 2, 3, 4, 5, 6]));
    const { links } = run([gabriel, twin], [usGabriel]);
    const confirmed = [...links.values()].filter((l) => l.status === "confirmed" && l.understatId === "u1");
    expect(confirmed.length).toBeLessThanOrEqual(1);
  });

  it("applies manual overrides: 'pair' forces a link, 'never' forbids one", () => {
    const forced = run([bahoya], [usNegoce], new Map(), [{ fplCode: 3, understatId: "u3", action: "pair", note: "checked by hand" }]);
    expect(forced.links.get(3)).toMatchObject({ understatId: "u3", status: "confirmed" });
    const forbidden = run([gabriel], [usGabriel], new Map(), [{ fplCode: 1, understatId: "u1", action: "never", note: "" }]);
    expect(forbidden.links.get(1)?.status).not.toBe("confirmed");
  });
});

describe("stillAgrees", () => {
  it("tolerates one odd appearance, not a pattern", () => {
    expect(stillAgrees({ agreement: 0.9, appearances: 10, mismatches: 1 })).toBe(true);
    expect(stillAgrees({ agreement: 0.7, appearances: 10, mismatches: 3 })).toBe(false);
    expect(stillAgrees({ agreement: 0, appearances: 1, mismatches: 1 })).toBe(true);
  });
});
