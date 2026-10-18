/**
 * Every Understat column the Explorers can show — Understat's own figures
 * only (<one_source_per_figure>, extensions/externalStats.ts).
 *
 * Two kinds:
 *  - Understat-only figures (shots, key passes, xGChain, PPDA…), in their
 *    own picker groups.
 *  - "Alternates": Understat's version of a figure FPL also has, where the
 *    two genuinely differ — xG, xA, xGI and their per-game and per-£m
 *    rates, Assists and Minutes (players); xG, xA, xGI, xGC and Assists
 *    (clubs). They keep the FPL column's key, so the column's place,
 *    width, sort and filter follow it when its source toggle is flipped.
 *    Goals, own goals, scores and results are the same in both sources (0
 *    differences in 23,837 player-matches checked), so they stay FPL only,
 *    and the daily sync keeps checking that.
 *
 * <incomplete_shot_list>: figures built from Understat's shot list are "—"
 * for a season where that list is missing shots its line-ups count (rare);
 * figures from the line-ups (xG, xA, key passes…) are unaffected.
 *
 * <club_xg_is_per_chance>: Understat's club xG (and xGA, NPxG) counts a
 * shot and its rebound as one chance, so it can be lower than the sum of
 * its players' xG; xG/Shot and the open-play/set-piece split are built from
 * the individual shots. Both are Understat's own figures.
 */
import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import type { PlayerColumn } from "../components/playerColumns";
import type { TeamColumn } from "../components/teamColumns";
import type { TeamAggregate } from "../metrics/teamStats";
import type { ExternalColumnSet } from "../extensions/externalStats";
import { perGame } from "../metrics/calculations";
import { fmtDecimal, fmtPercent, fmtSigned } from "../utils/format";
import type { UsClubResolved, UsPlayerResolved } from "./resolve";
import type { UsClubTotals, UsPlayerTotals } from "./schema";

export const UNDERSTAT_SOURCE_ID = "understat";

type PT = UsPlayerTotals;
type CT = UsClubTotals;

const setPieceOf = (s: PT["situations"]) => ({
  shots: s.FromCorner.shots + s.SetPiece.shots + s.DirectFreekick.shots,
  xG: s.FromCorner.xG + s.SetPiece.xG + s.DirectFreekick.xG,
});
const shotXGOf = (s: PT["situations"]) => Object.values(s).reduce((sum, x) => sum + x.xG, 0);

/** Per season (a Historic Average divides by the seasons known). */
const perSeason = (r: UsPlayerResolved | UsClubResolved, value: number) => value / r.seasons;
const ratio = (num: number, den: number, scale = 1) => (den > 0 ? (num / den) * scale : null);

const fmt = (decimals: number) => ({ format: (v: number | null) => fmtDecimal(v, decimals), decimals });
const pct = { format: (v: number | null) => fmtPercent(v, 1), decimals: 1 };
const signed = (decimals: number) => ({ format: (v: number | null) => fmtSigned(v, decimals), decimals });

export function understatPlayerColumns(lookup: (p: NormalizedPlayer) => UsPlayerResolved | null): ExternalColumnSet<PlayerColumn> {
  function col(
    key: string,
    label: string,
    value: (r: UsPlayerResolved, p: NormalizedPlayer) => number | null,
    format: Pick<PlayerColumn, "format" | "decimals">,
    extra: Partial<PlayerColumn> = {},
  ): PlayerColumn {
    return {
      key,
      label,
      group: "ADVANCED",
      sourceId: UNDERSTAT_SOURCE_ID,
      getValue: (p) => {
        const r = lookup(p);
        return r ? value(r, p) : null;
      },
      ...format,
      ...extra,
    };
  }
  const total = (f: (t: PT) => number) => (r: UsPlayerResolved) => perSeason(r, f(r.totals));
  const perGameOf = (f: (t: PT) => number) => (r: UsPlayerResolved) => perGame(f(r.totals), r.totals.minutes);
  /** Built from the shot list: "—" where it's incomplete (<incomplete_shot_list>). */
  const fromShots =
    (get: (r: UsPlayerResolved, p: NormalizedPlayer) => number | null) =>
    (r: UsPlayerResolved, p: NormalizedPlayer) =>
      r.totals.shotsComplete ? get(r, p) : null;
  const perMillion = (f: (t: PT) => number) => (r: UsPlayerResolved, p: NormalizedPlayer) => ratio(perSeason(r, f(r.totals)), p.price);
  const xGI = (t: PT) => t.xG + t.xA;

  const alternates: Record<string, PlayerColumn> = {
    xG: col("xG", "xG", total((t) => t.xG), fmt(2)),
    xA: col("xA", "xA", total((t) => t.xA), fmt(2)),
    xGI: col("xGI", "xGI", total(xGI), fmt(2)),
    xGPerGame: col("xGPerGame", "xG/Game", perGameOf((t) => t.xG), fmt(2)),
    xAPerGame: col("xAPerGame", "xA/Game", perGameOf((t) => t.xA), fmt(2)),
    xGIPerGame: col("xGIPerGame", "xGI/Game", perGameOf(xGI), fmt(2)),
    xGPerMillion: col("xGPerMillion", "xG/£m", perMillion((t) => t.xG), fmt(2)),
    xAPerMillion: col("xAPerMillion", "xA/£m", perMillion((t) => t.xA), fmt(2)),
    xGIPerMillion: col("xGIPerMillion", "xGI/£m", perMillion(xGI), fmt(2)),
    assists: col("assists", "Assists", total((t) => t.assists), fmt(0)),
    minutes: col("minutes", "Mins", total((t) => t.minutes), fmt(0)),
  };

  return {
    alternates,
    groups: [
      {
        heading: "Understat · Shooting",
        columns: [
          col("us.shots", "Shots", fromShots(total((t) => t.shots)), fmt(0)),
          col("us.shotsPerGame", "Shots/Game", fromShots(perGameOf((t) => t.shots)), fmt(2)),
          col("us.shotsOnTarget", "On Target", fromShots(total((t) => t.shotsOnTarget)), fmt(0)),
          col("us.onTargetPct", "On Target %", fromShots((r) => ratio(r.totals.shotsOnTarget, r.totals.shots, 100)), pct),
          col("us.xGPerShot", "xG/Shot", fromShots((r) => ratio(r.totals.xG, r.totals.shots)), fmt(2)),
          col("us.goalsMinusXG", "Goals − xG", (r) => perSeason(r, r.totals.goals - r.totals.xG), signed(2)),
          col("us.npGoals", "NP Goals", fromShots(total((t) => t.npGoals)), fmt(0)),
          col("us.npxG", "NPxG", fromShots(total((t) => t.npxG)), fmt(2)),
          col("us.npxGPerGame", "NPxG/Game", fromShots(perGameOf((t) => t.npxG)), fmt(2)),
          col("us.headedShots", "Headed Shots", fromShots(total((t) => t.bodyParts.Head.shots)), fmt(0)),
          col("us.headedXG", "Headed xG", fromShots(total((t) => t.bodyParts.Head.xG)), fmt(2)),
        ],
      },
      {
        heading: "Understat · Chance Type",
        columns: [
          col("us.openPlayShots", "Open-Play Shots", fromShots(total((t) => t.situations.OpenPlay.shots)), fmt(0)),
          col("us.openPlayXG", "Open-Play xG", fromShots(total((t) => t.situations.OpenPlay.xG)), fmt(2)),
          col("us.setPieceShots", "Set-Piece Shots", fromShots(total((t) => setPieceOf(t.situations).shots)), fmt(0)),
          col("us.setPieceXG", "Set-Piece xG", fromShots(total((t) => setPieceOf(t.situations).xG)), fmt(2)),
          col("us.cornerXG", "Corner xG", fromShots(total((t) => t.situations.FromCorner.xG)), fmt(2)),
          col("us.freeKickXG", "Free-Kick xG", fromShots(total((t) => t.situations.DirectFreekick.xG)), fmt(2)),
          col("us.penaltiesTaken", "Penalties Taken", fromShots(total((t) => t.situations.Penalty.shots)), fmt(0)),
          col("us.penaltyXG", "Penalty xG", fromShots(total((t) => t.situations.Penalty.xG)), fmt(2)),
          col(
            "us.setPieceShare",
            "Set-Piece xG %",
            fromShots((r) => ratio(setPieceOf(r.totals.situations).xG, shotXGOf(r.totals.situations) - r.totals.situations.Penalty.xG, 100)),
            pct,
          ),
        ],
      },
      {
        heading: "Understat · Creating",
        columns: [
          col("us.keyPasses", "Key Passes", total((t) => t.keyPasses), fmt(0)),
          col("us.keyPassesPerGame", "Key Passes/Game", perGameOf((t) => t.keyPasses), fmt(2)),
          col("us.xAPerKeyPass", "xA/Key Pass", (r) => ratio(r.totals.xA, r.totals.keyPasses), fmt(2)),
          col("us.xGChain", "xGChain", total((t) => t.xGChain), fmt(2)),
          col("us.xGChainPerGame", "xGChain/Game", perGameOf((t) => t.xGChain), fmt(2)),
          col("us.xGBuildup", "xGBuildup", total((t) => t.xGBuildup), fmt(2)),
          col("us.xGBuildupPerGame", "xGBuildup/Game", perGameOf((t) => t.xGBuildup), fmt(2)),
        ],
      },
      {
        heading: "Understat · Playing Time",
        columns: [col("us.appearances", "Apps", total((t) => t.appearances), fmt(0))],
      },
    ],
  };
}

export function understatTeamColumns(teamsById: Map<number, NormalizedTeam>, lookup: (t: NormalizedTeam) => UsClubResolved | null): ExternalColumnSet<TeamColumn> {
  function col(
    key: string,
    label: string,
    value: (r: UsClubResolved) => number | null,
    format: { format: (v: number | null) => string; decimals: number },
    extra: Partial<TeamColumn> = {},
  ): TeamColumn {
    return {
      key,
      label,
      group: "UNDERLYING PERFORMANCE",
      sourceId: UNDERSTAT_SOURCE_ID,
      getValue: (agg: TeamAggregate) => {
        const team = teamsById.get(agg.teamId);
        const r = team ? lookup(team) : null;
        return r ? value(r) : null;
      },
      format: format.format,
      decimals: format.decimals,
      ...extra,
    };
  }
  const total = (f: (t: CT) => number) => (r: UsClubResolved) => perSeason(r, f(r.totals));
  /** Built from the club's (or its opponents') shot list: "—" where it's incomplete (<incomplete_shot_list>). */
  const forShots = (get: (r: UsClubResolved) => number | null) => (r: UsClubResolved) => (r.totals.shotsCompleteFor ? get(r) : null);
  const againstShots = (get: (r: UsClubResolved) => number | null) => (r: UsClubResolved) => (r.totals.shotsCompleteAgainst ? get(r) : null);
  const setPiece = (s: CT["situationsFor"]) => s.FromCorner.xG + s.SetPiece.xG + s.DirectFreekick.xG;
  const whole = fmt(0);

  const alternates: Record<string, TeamColumn> = {
    xG: col("xG", "xG", total((t) => t.xG), fmt(2)),
    xA: col("xA", "xA", total((t) => t.xA), fmt(2)),
    xGI: col("xGI", "xGI", total((t) => t.xG + t.xA), fmt(2)),
    xGC: col("xGC", "xGC", total((t) => t.xGA), fmt(2), { higherIsBetter: false }),
    assists: col("assists", "Assists", total((t) => t.assists), whole),
  };

  return {
    alternates,
    groups: [
      {
        heading: "Understat · Attack",
        columns: [
          col("us.shots", "Shots", forShots(total((t) => t.shots)), whole),
          col("us.shotsOnTarget", "Shots on Target", forShots(total((t) => t.shotsOnTarget)), whole),
          col("us.xGPerShot", "xG/Shot", forShots((r) => ratio(shotXGOf(r.totals.situationsFor), r.totals.shots)), fmt(3)),
          col("us.npxG", "NPxG", total((t) => t.npxG), fmt(2)),
          col("us.keyPasses", "Key Passes", total((t) => t.keyPasses), whole),
          col("us.deep", "Deep Completions", total((t) => t.deep), whole),
          col("us.openPlayXG", "Open-Play xG", forShots(total((t) => t.situationsFor.OpenPlay.xG)), fmt(2)),
          col("us.setPieceXG", "Set-Piece xG", forShots(total((t) => setPiece(t.situationsFor))), fmt(2)),
          col("us.penaltyXG", "Penalty xG", forShots(total((t) => t.situationsFor.Penalty.xG)), fmt(2)),
        ],
      },
      {
        heading: "Understat · Defence",
        columns: [
          col("us.shotsAgainst", "Shots Against", againstShots(total((t) => t.shotsAgainst)), whole, { higherIsBetter: false }),
          col("us.shotsOnTargetAgainst", "On Target Against", againstShots(total((t) => t.shotsOnTargetAgainst)), whole, { higherIsBetter: false }),
          col("us.xGAPerShot", "xGA/Shot", againstShots((r) => ratio(shotXGOf(r.totals.situationsAgainst), r.totals.shotsAgainst)), fmt(3), { higherIsBetter: false }),
          col("us.npxGA", "NPxGA", total((t) => t.npxGA), fmt(2), { higherIsBetter: false }),
          col("us.deepAllowed", "Deep Allowed", total((t) => t.deepAllowed), whole, { higherIsBetter: false }),
          col("us.openPlayXGA", "Open-Play xGA", againstShots(total((t) => t.situationsAgainst.OpenPlay.xG)), fmt(2), { higherIsBetter: false }),
          col("us.setPieceXGA", "Set-Piece xGA", againstShots(total((t) => setPiece(t.situationsAgainst))), fmt(2), { higherIsBetter: false }),
        ],
      },
      {
        heading: "Understat · Style & Luck",
        columns: [
          col("us.ppda", "PPDA", (r) => ratio(r.totals.ppdaAtt, r.totals.ppdaDef), fmt(2), { higherIsBetter: false }),
          col("us.oppPpda", "Opp. PPDA", (r) => ratio(r.totals.ppdaAllowedAtt, r.totals.ppdaAllowedDef), fmt(2)),
          col("us.npxGD", "NPxGD", total((t) => t.npxG - t.npxGA), signed(2)),
          col("us.xPts", "xPts", total((t) => t.xPts), fmt(1)),
          col("us.ptsMinusXPts", "Pts − xPts", total((t) => t.pts - t.xPts), signed(1)),
        ],
      },
    ],
  };
}
