import { describe, expect, it } from "vitest";
import { understatPlayerColumns } from "./columns";
import { understatPlayerXGC } from "./playerXGC";
import { playerLogRanks, type UsComparisonContext } from "./comparisons";
import { createProfiles, playerKey } from "./profiles";
import type { UsPlayerResolved } from "./resolve";
import type { UsPlayerTotals } from "./schema";
import type { UsShot } from "./profileData";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { perGame } from "../metrics/calculations";
import { makePlayer } from "../test/fixtures";

// <understat_player_xgc>: Understat's xGC for a player, the ⇄ version of FPL's, everywhere.

const none = { shots: 0, goals: 0, xG: 0 };
const facing = (openPlayXG: number, penaltyXG = 0, complete = true) => ({
  shots: 10,
  shotsOnTarget: 4,
  complete,
  situations: { OpenPlay: { shots: 9, goals: 1, xG: openPlayXG }, FromCorner: none, SetPiece: none, DirectFreekick: none, Penalty: { shots: 1, goals: 1, xG: penaltyXG } },
});
const row = (minutes: number, f: UsPlayerTotals["facing"], appearances = 10) => ({ minutes, appearances, facing: f }) as unknown as UsPlayerTotals;
const player = makePlayer({ id: 1, position: "DEF" });
const D = {} as PlayerDerivedMetrics;

describe("Understat's xGC for a player", () => {
  it("is the xG of the shots his club faced while he was on the pitch, every situation", () => {
    expect(understatPlayerXGC(row(900, facing(1.2, 0.76)))).toBeCloseTo(1.96, 10);
  });

  it("is unknown — never 0 — without shots-faced totals or with a short shot list", () => {
    expect(understatPlayerXGC(row(900, undefined))).toBeNull();
    expect(understatPlayerXGC(row(900, facing(1.2, 0, false)))).toBeNull();
  });

  it("the Explorers' xGC and xGC/Game ⇄ columns: per season, per game on Understat's minutes, fewer better, the total ranked per game", () => {
    const r: UsPlayerResolved = { totals: row(1800, facing(4, 0)), seasons: 2 };
    const set = understatPlayerColumns(() => r);
    expect(set.alternates.xGC.getValue(player, D)).toBeCloseTo(2, 10);
    expect(set.alternates.xGCPerGame.getValue(player, D)).toBeCloseTo(perGame(4, 1800)!, 10);
    expect(set.alternates.xGC.higherIsBetter).toBe(false);
    expect(set.alternates.xGCPerGame.higherIsBetter).toBe(false);
    expect(set.alternates.xGC.rankBy!(player, D)).toBeCloseTo(perGame(4, 1800)!, 10);
    expect(understatPlayerColumns(() => ({ totals: row(1800, undefined), seasons: 1 })).alternates.xGC.getValue(player, D)).toBeNull();
  });

  it("Match Log: each match's xG faced while he was on; a match he didn't play is a provable 0; none known is —", () => {
    const shot = (fixture: number, xG: number): UsShot => ({ fixture, minute: 30, x: 0.9, y: 0.5, xG, result: "SavedShot", situation: "OpenPlay", shotType: "Head" });
    const matches = [
      { fixture: 1, position: "DC", minutes: 90, xG: 0, xA: 0, assists: 0 },
      { fixture: 2, position: "DC", minutes: 90, xG: 0, xA: 0, assists: 0 },
    ];
    const p = createProfiles(new Map([[playerKey(5, "2025/26"), { state: "ready", detail: { matches, shots: [], shotsFaced: [shot(1, 0.4), shot(1, 0.3)] } }]]), { player: () => {}, club: () => {} });
    const alt = p.playerMatchAlternates(5, "2025/26", [
      { fixtureId: 1, minutes: 90 },
      { fixtureId: 2, minutes: 90 },
      { fixtureId: 3, minutes: 0 },
    ]).xgc;
    expect(alt.cell(1)).toBe("0.70");
    expect(alt.cell(2)).toBe("0.00");
    expect(alt.cell(3)).toBe("0.00");
    expect(alt.total).toBe("0.70");
    const old = createProfiles(new Map([[playerKey(5, "2025/26"), { state: "ready", detail: { matches, shots: [], shotsFaced: null } }]]), { player: () => {}, club: () => {} });
    expect(old.playerMatchAlternates(5, "2025/26", [{ fixtureId: 1, minutes: 90 }]).xgc.cell(1)).toBe("—");
  });

  it("Match Log colours: fewer is better, the total per game and the average per match — so playing less isn't a head start", () => {
    // Him: 10 xGC in 1800 minutes (20 matches). Peers: 6 in 900 (10 matches) — fewer in total, more per game; 30 in 3420 (38 matches).
    const ctx: UsComparisonContext = {
      seasons: new Map([
        [
          "2025/26",
          {
            season: "2025/26",
            complete: true,
            latestMatchDate: null,
            players: new Map([
              [1, row(1800, facing(10), 20)],
              [2, row(900, facing(6), 10)],
              [3, row(3420, facing(30), 38)],
            ]),
            clubs: new Map(),
          },
        ],
      ]),
      liveSeason: "2026/27",
      positionByCode: new Map([
        [1, "DEF"],
        [2, "DEF"],
        [3, "DEF"],
      ]),
      clubCodeByPlayerCode: new Map(),
    };
    const ranks = playerLogRanks(ctx, 1, "2025/26", understatPlayerXGC, { total: 10, average: 0.5 }, false);
    // Per game he's best (0.50 against 0.60 and 0.79); per match too (0.5 against 0.6 and 0.79).
    expect(ranks.total).toBeCloseTo((2.5 / 3) * 100);
    expect(ranks.average).toBeCloseTo((2.5 / 3) * 100);
  });
});
