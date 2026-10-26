import { perGame } from "../metrics/calculations";
import type { Position } from "../types/normalized";
import type { UsPlayerResolved } from "./resolve";
import type { UsPlayerTotals } from "./schema";
import { understatPlayerXGC } from "./playerXGC";

/**
 * The player profile's Understat Summary: the figures that matter most for
 * his position, as tiles (components/playerProfile/ProfileSummary.tsx, the
 * same card as FPL's Summary). Understat's own figures only
 * (<one_source_per_figure>), worked out exactly as the Explorers' Understat
 * columns with the same name (columns.ts; summary.test.ts checks they
 * agree): a count per season (a Historic Average divides by the seasons
 * known), a per-game rate from the summed totals on Understat's minutes
 * (<us_minutes_for_us_rates>). Shot-list figures are "—" where that list
 * is incomplete (<incomplete_shot_list>), shots-faced figures where those
 * are (<understat_player_xgc>).
 *
 * By position (owner's request 2026-10-24, the choice made here):
 *  - Goalkeeper: Defensive — the shots his club faced while he was on the
 *    pitch, which is all Understat has on a keeper.
 *  - Defender: Defensive, then Offensive; Actual vs Expected beside
 *    Creating (per game).
 *  - Midfielder: Offensive, then Creating; Actual vs Expected beside
 *    Shooting (per game).
 *  - Forward: Offensive, then Shooting; Actual vs Expected beside Creating
 *    (per game).
 * Groups of 6 are three totals over the same three per game; groups of 3
 * share a row (ProfileSummary).
 */

type R = UsPlayerResolved;
type Facing = NonNullable<UsPlayerTotals["facing"]>;

export interface UsSummaryFigure {
  label: string;
  /** count: whole (countDecimals: 1 dp for a small count's Historic Average); rate: 2 dp; signed: 2 dp with its sign. */
  kind: "count" | "rate" | "signed";
  /** A count recorded only a handful of times a season (PlayerColumn.smallCount, <whole_numbers>). */
  smallCount?: boolean;
  value: (r: R) => number | null;
  higherIsBetter: boolean;
  /** What its colour ranks on when that isn't its own figure: a lower-is-better total grows with minutes, so it ranks per game (as xGC does everywhere). */
  rankBy?: (r: R) => number | null;
  /** On hover, when the label doesn't say. */
  title?: string;
}

const total = (f: (t: UsPlayerTotals) => number) => (r: R) => f(r.totals) / r.seasons;
const perGameOf = (f: (t: UsPlayerTotals) => number) => (r: R) => perGame(f(r.totals), r.totals.minutes);
const fromShots = (get: (r: R) => number | null) => (r: R) => (r.totals.shotsComplete ? get(r) : null);
const ratio = (num: number, den: number) => (den > 0 ? num / den : null);
/** From the shots faced while he was on the pitch (server <shots_faced_on_pitch>): "—" where they're unknown or incomplete. */
const faced = (get: (f: Facing, r: R) => number | null) => (r: R) => (r.totals.facing?.complete ? get(r.totals.facing, r) : null);
const xGI = (t: UsPlayerTotals) => t.xG + t.xA;
const xGCPerGame = (r: R) => {
  const v = understatPlayerXGC(r.totals);
  return v === null ? null : perGame(v, r.totals.minutes);
};
const shotsFacedPerGame = faced((f, r) => perGame(f.shots, r.totals.minutes));
const onTargetFacedPerGame = faced((f, r) => perGame(f.shotsOnTarget, r.totals.minutes));
const FACED_HINT = "His club's opponents' shots while he was on the pitch";

/** Keyed by the Explorers' column key where they have the figure. */
export const US_SUMMARY_FIGURES = {
  xG: { label: "xG", kind: "rate", value: total((t) => t.xG), higherIsBetter: true },
  xA: { label: "xA", kind: "rate", value: total((t) => t.xA), higherIsBetter: true },
  xGI: { label: "xGI", kind: "rate", value: total(xGI), higherIsBetter: true },
  xGPerGame: { label: "xG/Game", kind: "rate", value: perGameOf((t) => t.xG), higherIsBetter: true },
  xAPerGame: { label: "xA/Game", kind: "rate", value: perGameOf((t) => t.xA), higherIsBetter: true },
  xGIPerGame: { label: "xGI/Game", kind: "rate", value: perGameOf(xGI), higherIsBetter: true },
  "us.shots": { label: "Shots", kind: "count", value: fromShots(total((t) => t.shots)), higherIsBetter: true },
  "us.npxG": { label: "NPxG", kind: "rate", value: fromShots(total((t) => t.npxG)), higherIsBetter: true, title: "Non-penalty xG" },
  "us.npGoals": { label: "NP Goals", kind: "count", smallCount: true, value: fromShots(total((t) => t.npGoals)), higherIsBetter: true, title: "Non-penalty goals" },
  "us.shotsPerGame": { label: "Shots/Game", kind: "rate", value: fromShots(perGameOf((t) => t.shots)), higherIsBetter: true },
  "us.npxGPerGame": { label: "NPxG/Game", kind: "rate", value: fromShots(perGameOf((t) => t.npxG)), higherIsBetter: true, title: "Non-penalty xG per game" },
  "us.npxGPerShot": {
    label: "NPxG/Shot",
    kind: "rate",
    value: fromShots((r) => ratio(r.totals.npxG, r.totals.shots - r.totals.situations.Penalty.shots)),
    higherIsBetter: true,
    title: "Non-penalty xG per non-penalty shot",
  },
  "us.keyPasses": { label: "Key Passes", kind: "count", value: total((t) => t.keyPasses), higherIsBetter: true },
  "us.xGChain": { label: "xGChain", kind: "rate", value: total((t) => t.xGChain), higherIsBetter: true, title: "xG of every attack he was part of" },
  "us.xGBuildup": { label: "xGBuildup", kind: "rate", value: total((t) => t.xGBuildup), higherIsBetter: true, title: "xGChain without the shot or the pass before it" },
  "us.keyPassesPerGame": { label: "Key Passes/Game", kind: "rate", value: perGameOf((t) => t.keyPasses), higherIsBetter: true },
  "us.xGChainPerGame": { label: "xGChain/Game", kind: "rate", value: perGameOf((t) => t.xGChain), higherIsBetter: true, title: "xG of every attack he was part of, per game" },
  "us.xGBuildupPerGame": { label: "xGBuildup/Game", kind: "rate", value: perGameOf((t) => t.xGBuildup), higherIsBetter: true, title: "xGChain without the shot or the pass before it, per game" },
  goalsMinusXG: { label: "Goals − xG", kind: "signed", value: total((t) => t.goals - t.xG), higherIsBetter: true },
  assistsMinusXA: { label: "Assists − xA", kind: "signed", value: total((t) => t.assists - t.xA), higherIsBetter: true },
  "us.npGoalsMinusNpxG": { label: "NP Goals − NPxG", kind: "signed", value: fromShots(total((t) => t.npGoals - t.npxG)), higherIsBetter: true, title: "Non-penalty goals against non-penalty xG" },
  // <understat_player_xgc>: the xG his club faced while he was on the pitch.
  xGC: {
    label: "xGC",
    kind: "rate",
    value: (r: R) => {
      const v = understatPlayerXGC(r.totals);
      return v === null ? null : v / r.seasons;
    },
    higherIsBetter: false,
    rankBy: xGCPerGame,
    title: "xG of his club's opponents' shots while he was on the pitch",
  },
  xGCPerGame: { label: "xGC/Game", kind: "rate", value: xGCPerGame, higherIsBetter: false, title: "xG of his club's opponents' shots while he was on the pitch, per game" },
  "us.shotsFaced": { label: "Shots Faced", kind: "count", value: faced((f, r) => f.shots / r.seasons), higherIsBetter: false, rankBy: shotsFacedPerGame, title: FACED_HINT },
  "us.onTargetFaced": { label: "On Target Faced", kind: "count", value: faced((f, r) => f.shotsOnTarget / r.seasons), higherIsBetter: false, rankBy: onTargetFacedPerGame, title: `${FACED_HINT}, on target` },
  "us.shotsFacedPerGame": { label: "Shots Faced/Game", kind: "rate", value: shotsFacedPerGame, higherIsBetter: false, title: `${FACED_HINT}, per game` },
  "us.onTargetFacedPerGame": { label: "On Target Faced/Game", kind: "rate", value: onTargetFacedPerGame, higherIsBetter: false, title: `${FACED_HINT}, on target, per game` },
} satisfies Record<string, UsSummaryFigure>;

export type UsSummaryKey = keyof typeof US_SUMMARY_FIGURES;

const DEFENSIVE: UsSummaryKey[] = ["xGC", "us.shotsFaced", "us.onTargetFaced", "xGCPerGame", "us.shotsFacedPerGame", "us.onTargetFacedPerGame"];
const OFFENSIVE: UsSummaryKey[] = ["xG", "xA", "xGI", "xGPerGame", "xAPerGame", "xGIPerGame"];
const SHOOTING: UsSummaryKey[] = ["us.shots", "us.npxG", "us.npGoals", "us.shotsPerGame", "us.npxGPerGame", "us.npxGPerShot"];
const CREATING: UsSummaryKey[] = ["us.keyPasses", "us.xGChain", "us.xGBuildup", "us.keyPassesPerGame", "us.xGChainPerGame", "us.xGBuildupPerGame"];
const ACTUAL_VS_EXPECTED: UsSummaryKey[] = ["goalsMinusXG", "assistsMinusXA", "us.npGoalsMinusNpxG"];
/** A six-figure group's per-game half, for the row it shares with Actual vs Expected. */
const perGameHalf = (keys: UsSummaryKey[]) => keys.slice(3);

/** The Summary's groups for a position, in order (see the top of this file). */
export function usSummaryGroups(position: Position): { title: string; keys: UsSummaryKey[] }[] {
  const avx = { title: "Actual vs Expected", keys: ACTUAL_VS_EXPECTED };
  switch (position) {
    case "GKP":
      return [{ title: "Defensive", keys: DEFENSIVE }];
    case "DEF":
      return [{ title: "Defensive", keys: DEFENSIVE }, { title: "Offensive", keys: OFFENSIVE }, avx, { title: "Creating", keys: perGameHalf(CREATING) }];
    case "MID":
      return [{ title: "Offensive", keys: OFFENSIVE }, { title: "Creating", keys: CREATING }, avx, { title: "Shooting", keys: perGameHalf(SHOOTING) }];
    case "FWD":
      return [{ title: "Offensive", keys: OFFENSIVE }, { title: "Shooting", keys: SHOOTING }, avx, { title: "Creating", keys: perGameHalf(CREATING) }];
  }
}
