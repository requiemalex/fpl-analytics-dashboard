import React from "react";
import type { ExternalMatchColumn, ExternalProfiles, ProfileView } from "../extensions/externalStats";
import { DASH, fmtDecimal, fmtPercent, fmtSigned } from "../utils/format";
import { percentileTint } from "../utils/colorScale";
import { sumKnown, type PartialSum } from "../metrics/partialTotals";
import { withCoverage } from "../components/primitives";
import { SmallSampleBadge } from "../components/MinutesFloorBadge";
import { ProfileSummary, type SummaryGroup } from "../components/playerProfile/ProfileSummary";
import { countDecimals } from "../components/playerColumns";
import type { Position } from "../types/normalized";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import {
  clubLogRanks,
  clubShotRanks,
  floorFor,
  leagueChanceRank,
  playerLogRanks,
  playerShotRanks,
  playerFacedRanks,
  playerShotsEligible,
  playerSummaryRanks,
  type FacedPart,
  type UsComparisonContext,
} from "./comparisons";
import { sumPlayerSeasons } from "./resolve";
import { US_SUMMARY_FIGURES, usSummaryGroups, type UsSummaryFigure, type UsSummaryKey } from "./summary";
import type { UsClubTotals, UsPlayerTotals, UsSlice } from "./schema";
import type { DetailLoad, UsClubSeasonDetail, UsPlayerSeasonDetail, UsShot } from "./profileData";
import { isBeyondMap, ShotMap, SHOT_MAP_DEPTH } from "./ShotMap";
import { FormationsSection } from "./formations";
import { POSITION_NAMES } from "./positionNames";
import { understatPlayerXGC, xGCByFixture } from "./playerXGC";

/**
 * What Understat adds to the player and team profiles
 * (extensions/externalStats.ts ExternalProfiles): shot maps for the
 * profile's Data View, a club's formations this season, and per-match
 * figures for its Match Log — its own columns (a player's position in each
 * match, a club's chances of each result) and its version of the figures
 * both sources have, for the log's ⇄ toggles. Everything is Understat's own
 * figures, by FPL fixture; a season Understat has nothing for is unknown
 * ("—"), never 0.
 *
 * Cards are laid out by the profile's grid (`.profile-grid`): a card with
 * `profile-span-2` takes the full width.
 */

export const playerKey = (code: number, season: string) => `player:${code}:${season}`;
export const clubKey = (code: number, season: string) => `club:${code}:${season}`;

type Loads = ReadonlyMap<string, DetailLoad<UsPlayerSeasonDetail> | DetailLoad<UsClubSeasonDetail>>;

/** The view's seasons as loaded: still loading, failed, or the details Understat has (seasons it has nothing for left out, so not counted). */
function gather<T>(loads: Loads, keys: string[]): { state: "loading" } | { state: "error" } | { state: "ready"; details: T[] } {
  const got = keys.map((k) => loads.get(k) as DetailLoad<T> | undefined);
  if (got.some((l) => !l || l.state === "loading")) return { state: "loading" };
  if (got.some((l) => l!.state === "error")) return { state: "error" };
  return { state: "ready", details: got.flatMap((l) => (l!.state === "ready" ? [l!.detail] : [])) };
}

function StatusCard({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "card profile-span-2" : "card"}>
      <div className="card-title">{title}</div>
      <p className="page-subtitle" style={{ margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

/**
 * A shot list's panel figures: counts per season (over `seasons`); the
 * rates — on target and goals as a share of the shots (0–1), xG per shot —
 * over all of them, so a Historic Average's rate is from its totals.
 * Penalties: how many of the shots were penalties; Penalty Goals: how many
 * of those were scored.
 */
function shotFigures(shots: UsShot[], seasons: number) {
  const xG = shots.reduce((sum, s) => sum + s.xG, 0);
  const onTarget = shots.filter((s) => s.result === "Goal" || s.result === "SavedShot").length;
  const goals = shots.filter((s) => s.result === "Goal").length;
  const penalties = shots.filter((s) => s.situation === "Penalty");
  const rate = (n: number) => (shots.length > 0 ? n / shots.length : null);
  return {
    shots: shots.length / seasons,
    onTarget: onTarget / seasons,
    onTargetShare: rate(onTarget),
    goals: goals / seasons,
    conversion: rate(goals),
    xG: xG / seasons,
    npxG: shots.filter((s) => s.situation !== "Penalty").reduce((sum, s) => sum + s.xG, 0) / seasons,
    xGPerShot: rate(xG),
    penalties: penalties.length / seasons,
    penaltyGoals: penalties.filter((s) => s.result === "Goal").length / seasons,
  };
}
type ShotFigureKey = keyof ReturnType<typeof shotFigures>;

const sliceSum = (s: Record<string, UsSlice>, pick: (x: UsSlice) => number, skipPenalty = false) =>
  Object.entries(s).reduce((sum, [k, x]) => (skipPenalty && k === "Penalty" ? sum : sum + pick(x)), 0);

/**
 * The same figures from a season's summary row, as [numerator, denominator]
 * (a count is [total, 1]) — built from the shot situations, like the panel
 * from the shot list: goals and xG are shots' (own goals are nobody's).
 */
function summaryShotParts(shots: number, onTarget: number, situations: Record<string, UsSlice>): Record<ShotFigureKey, [number, number] | null> {
  const xG = sliceSum(situations, (x) => x.xG);
  const goals = sliceSum(situations, (x) => x.goals);
  return {
    shots: [shots, 1],
    onTarget: [onTarget, 1],
    onTargetShare: shots > 0 ? [onTarget, shots] : null,
    goals: [goals, 1],
    conversion: shots > 0 ? [goals, shots] : null,
    xG: [xG, 1],
    npxG: [sliceSum(situations, (x) => x.xG, true), 1],
    xGPerShot: shots > 0 ? [xG, shots] : null,
    penalties: [situations.Penalty?.shots ?? 0, 1],
    penaltyGoals: [situations.Penalty?.goals ?? 0, 1],
  };
}
const SHOT_FIGURE_KEYS: ShotFigureKey[] = ["shots", "onTarget", "onTargetShare", "goals", "conversion", "xG", "npxG", "xGPerShot", "penalties", "penaltyGoals"];
/** A player's Shots Faced map, on hover (server <shots_faced_on_pitch>). */
const SHOTS_FACED_HINT =
  "His club's opponents' shots while he was on the pitch, from Understat's minutes (a shot around a substitution can be a minute out). Coloured against the others in his position, fewer better: counts per 90 minutes on the pitch, so more minutes isn't held against him; shares as they are.";

/** Rates: ranked as they are, never per season. */
const SHOT_RATE_KEYS = new Set<ShotFigureKey>(["onTargetShare", "conversion", "xGPerShot"]);

/** A player's Shots Faced figures from a season summary row, as ranked (playerFacedRanks): a count per 90 minutes on the pitch, a share as it is. */
const FACED_PARTS = Object.fromEntries(
  SHOT_FIGURE_KEYS.map((key): [string, FacedPart] => [
    key,
    (row) => {
      if (!row.facing) return null;
      const part = summaryShotParts(row.facing.shots, row.facing.shotsOnTarget, row.facing.situations)[key];
      if (!part || SHOT_RATE_KEYS.has(key)) return part;
      return row.minutes > 0 ? [part[0] * 90, row.minutes] : null;
    },
  ]),
);

/**
 * A shot map and its figures — shots, on target (scored or saved) and as a
 * share of the shots, goals and conversion (goals per shot), xG,
 * non-penalty xG, xG per shot and penalties — a season's, or per season
 * over a Historic Average (rates from the totals), under one heading naming
 * which. `faced`: the shots someone else took (a club's opponents, or a
 * defender's club's while he was on the pitch), worded so on hover.
 * `wide` puts the figures in a panel beside the map, one row each, for a
 * card the full width of the profile; otherwise they sit under it, three
 * to a row.
 */
function ShotCard({
  title,
  titleHint,
  shots,
  seasons,
  label,
  heading,
  wide,
  faced,
  ranks,
  smallSampleNote,
}: {
  title: string;
  /** Hover text on the title: what the map counts, when its name doesn't say. */
  titleHint?: string;
  shots: UsShot[];
  seasons: number;
  label: string;
  heading: string;
  wide?: boolean;
  faced?: boolean;
  /** Each figure's comparative rank (<comparative_colouring>), when it has one. */
  ranks?: Partial<Record<ShotFigureKey, number | null>>;
  /** Set when the figures are left uncoloured for being under the minutes floor: the title's amber stopwatch says so (<minutes_marker>). */
  smallSampleNote?: string | null;
}) {
  const dp = seasons > 1 ? 1 : 0;
  const f = shotFigures(shots, seasons);
  const beyond = shots.filter(isBeyondMap).length;
  const scored = faced ? "conceded" : "scored";
  const rows: { key: ShotFigureKey; label: string; value: string; title?: string }[] = [
    { key: "shots", label: "Shots", value: fmtDecimal(f.shots, dp), title: beyond > 0 ? `${fmtDecimal(beyond / seasons, dp)} of them from further than ${SHOT_MAP_DEPTH} m` : undefined },
    { key: "onTarget", label: "On Target", value: fmtDecimal(f.onTarget, dp), title: "Scored or saved" },
    { key: "onTargetShare", label: "On Target %", value: pct(f.onTargetShare), title: "Share of the shots that were on target (scored or saved)" },
    { key: "goals", label: "Goals", value: fmtDecimal(f.goals, dp), title: faced ? "Goals conceded from these shots" : undefined },
    { key: "conversion", label: "Conversion %", value: pct(f.conversion), title: `Share of the shots ${scored}` },
    { key: "xG", label: "xG", value: fmtDecimal(f.xG, 2) },
    { key: "npxG", label: "NPxG", value: fmtDecimal(f.npxG, 2), title: "Non-penalty xG" },
    { key: "xGPerShot", label: "xG/Shot", value: fmtDecimal(f.xGPerShot, 2) },
    { key: "penalties", label: faced ? "Penalties Conceded" : "Penalties Taken", value: fmtDecimal(f.penalties, dp), title: faced ? "Penalties taken against" : undefined },
    { key: "penaltyGoals", label: "Penalty Goals", value: fmtDecimal(f.penaltyGoals, dp), title: faced ? "Penalties scored against" : "Penalties scored" },
  ];
  return (
    <div className={wide ? "card profile-span-2" : "card"}>
      <div className="card-title">
        <span title={titleHint}>{title}</span>
        {smallSampleNote && <SmallSampleBadge note={smallSampleNote} />}
      </div>
      <div className={wide ? "shot-card-body is-wide" : "shot-card-body"}>
        <ShotMap shots={shots} seasons={seasons} label={label} />
        <div className="shot-stats">
          <div className="shot-stats-heading">{heading}</div>
          <div className="shot-stats-rows">
            {rows.map((r) => (
              <div className="shot-stats-row" key={r.label} title={r.title}>
                <span className="shot-stats-label">{r.label}</span>
                <span className="shot-stats-value num" style={{ background: percentileTint(ranks?.[r.key]) }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The shot figures' heading: the season they're from, or per season over how many. */
function statsHeading(view: ProfileView, counted: number): string {
  if (view.mode !== "historicAverage") return view.seasons?.[0] ?? "";
  return `Per season · ${counted} season${counted === 1 ? "" : "s"}`;
}

function seasonsLabel(view: ProfileView, counted: number): string {
  if (view.mode !== "historicAverage") return view.seasons?.[0] ?? "";
  return `a season, averaged over ${counted} season${counted === 1 ? "" : "s"}`;
}

const pct = (v: number | null) => (v === null ? DASH : fmtPercent(v * 100, 0));

/**
 * The listed matches' figures that Understat has (<partial_totals>, the
 * same rule as every Match Log): a match it lacks (the latest, before the
 * next daily sync) is left out, not counted as 0. "—" only when it has
 * none of them.
 */
const counted = sumKnown;

/** A Totals or Average cell from only some of the listed matches says so on hover. */
function coverage(text: string, c: PartialSum | null): React.ReactNode {
  return withCoverage(text, c, "Understat");
}

/** A switched Match Log column: each match's figure, and its Totals and Average over the matches Understat has a figure for. */
function alternate(
  key: string,
  values: Map<number, number | null>,
  fixtureIds: number[],
  totalDp: number,
  averageDp: number,
  rank?: (shown: { total: number | null; average: number | null }) => { total: number | null; average: number | null },
): ExternalMatchColumn {
  const c = counted(fixtureIds.map((f) => values.get(f) ?? null));
  const shown = { total: c?.sum ?? null, average: c === null ? null : c.sum / c.n };
  const ranks = rank?.(shown);
  return {
    key,
    header: key,
    cell: (fixture) => fmtDecimal(values.get(fixture) ?? null, totalDp),
    total: coverage(fmtDecimal(shown.total, totalDp), c),
    average: coverage(fmtDecimal(shown.average, averageDp), c),
    totalTint: percentileTint(ranks?.total),
    averageTint: percentileTint(ranks?.average),
  };
}

const sumOrNull = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** The Match Log figures both sources have, from a season summary row (for the comparison pools). */
const PLAYER_LOG_FIGURES: Record<string, { value: (t: UsPlayerTotals) => number | null; higherIsBetter: boolean }> = {
  min: { value: (t) => t.minutes, higherIsBetter: true },
  a: { value: (t) => t.assists, higherIsBetter: true },
  xg: { value: (t) => t.xG, higherIsBetter: true },
  xa: { value: (t) => t.xA, higherIsBetter: true },
  xgi: { value: (t) => t.xG + t.xA, higherIsBetter: true },
  xgc: { value: understatPlayerXGC, higherIsBetter: false },
};
const CLUB_LOG_FIGURES: Record<string, { value: (t: UsClubTotals) => number; higherIsBetter: boolean }> = {
  a: { value: (t) => t.assists, higherIsBetter: true },
  xg: { value: (t) => t.xG, higherIsBetter: true },
  xa: { value: (t) => t.xA, higherIsBetter: true },
  xgi: { value: (t) => t.xG + t.xA, higherIsBetter: true },
  xgc: { value: (t) => t.xGA, higherIsBetter: false },
};

/**
 * `compare`: the season summaries and FPL positions the comparative
 * colours rank against (comparisons.ts); null while they're loading, when
 * nothing is coloured.
 */
export function createProfiles(
  loads: Loads,
  request: { player: (code: number, seasons: string[]) => void; club: (code: number, seasons: string[]) => void },
  compare: UsComparisonContext | null = null,
): ExternalProfiles {
  const playerDetail = (code: number, season: string) => {
    const load = loads.get(playerKey(code, season)) as DetailLoad<UsPlayerSeasonDetail> | undefined;
    return load?.state === "ready" ? load.detail : null;
  };
  const clubDetail = (code: number, season: string) => {
    const load = loads.get(clubKey(code, season)) as DetailLoad<UsClubSeasonDetail> | undefined;
    return load?.state === "ready" ? load.detail : null;
  };

  /**
   * A player's Summary card for the view's seasons, from Understat's season
   * summaries (summary.ts), coloured against his position (comparisons.ts
   * playerSummaryRanks). `state` "none": Understat has no row for him in
   * any of them.
   */
  const summaryCard = (
    code: number,
    seasons: string[],
    mode: AnalysisMode,
    position: Position,
    smallSampleNote: string | null,
  ): { card: React.ReactNode; state: "loading" | "none" | "ready" } => {
    if (!compare) return { card: <StatusCard title="Summary" wide>Loading…</StatusCard>, state: "loading" };
    const own = sumPlayerSeasons(seasons.flatMap((s) => {
      const row = compare.seasons.get(s)?.players.get(code);
      return row ? [row] : [];
    }));
    if (!own) return { card: <StatusCard title="Summary" wide>No Understat record for this view ({DASH}).</StatusCard>, state: "none" };
    const groups = usSummaryGroups(position);
    const figure = (key: UsSummaryKey): UsSummaryFigure => US_SUMMARY_FIGURES[key];
    const ranks = playerSummaryRanks(
      compare,
      code,
      seasons,
      own,
      groups.flatMap((g) => g.keys).map((key) => ({ key, higherIsBetter: figure(key).higherIsBetter, rank: figure(key).rankBy ?? figure(key).value })),
    );
    const format = (f: UsSummaryFigure, v: number | null) => (f.kind === "signed" ? fmtSigned(v, 2) : fmtDecimal(v, f.kind === "count" ? countDecimals(mode) : 2));
    const summaryGroups: SummaryGroup[] = groups.map((g) => ({
      title: g.title,
      figures: g.keys.map((key) => {
        const f = figure(key);
        return { label: f.label, value: format(f, f.value(own)), percentile: ranks[key], title: f.title };
      }),
    }));
    return {
      card: <ProfileSummary groups={summaryGroups} position={position} badge={smallSampleNote ? <SmallSampleBadge note={smallSampleNote} /> : null} />,
      state: "ready",
    };
  };

  return {
    requestPlayer: request.player,
    requestClub: request.club,

    playerMatchColumns(code, season) {
      const byFixture = new Map((playerDetail(code, season)?.matches ?? []).map((m) => [m.fixture, m]));
      return [
        {
          key: "us-position",
          header: "Position",
          title: "Understat: where he played in the match (Sub: came off the bench)",
          cell: (fixture) => {
            const m = byFixture.get(fixture);
            return m ? <span title={POSITION_NAMES[m.position] ?? m.position}>{m.position}</span> : DASH;
          },
        },
      ];
    },

    playerMatchAlternates(code, season, matches) {
      const detail = playerDetail(code, season);
      const byFixture = new Map((detail?.matches ?? []).map((m) => [m.fixture, m]));
      const fixtureIds = matches.map((m) => m.fixtureId);
      const faced = detail?.shotsFaced ? xGCByFixture(detail.shotsFaced) : null;
      // Understat lists only matches he played in: one FPL says he didn't is a provable 0; one he did that Understat lacks is "—".
      const values = (get: (m: UsPlayerSeasonDetail["matches"][number]) => number | null) =>
        new Map(
          matches.map(({ fixtureId, minutes }) => {
            if (!detail) return [fixtureId, null];
            const m = byFixture.get(fixtureId);
            return [fixtureId, m ? get(m) : minutes === 0 ? 0 : null];
          }),
        );
      const rank = (key: string) =>
        compare ? (shown: { total: number | null; average: number | null }) => playerLogRanks(compare, code, season, PLAYER_LOG_FIGURES[key].value, shown, PLAYER_LOG_FIGURES[key].higherIsBetter) : undefined;
      return {
        min: alternate("min", values((m) => m.minutes), fixtureIds, 0, 0, rank("min")),
        a: alternate("a", values((m) => m.assists), fixtureIds, 0, 2, rank("a")),
        xg: alternate("xg", values((m) => m.xG), fixtureIds, 2, 2, rank("xg")),
        xa: alternate("xa", values((m) => m.xA), fixtureIds, 2, 2, rank("xa")),
        xgi: alternate("xgi", values((m) => sumOrNull(m.xG, m.xA)), fixtureIds, 2, 2, rank("xgi")),
        // <understat_player_xgc>: the xG his club faced while he was on, each match (0 in one where it faced no shot then).
        xgc: alternate("xgc", values((m) => (faced ? (faced.get(m.fixture) ?? 0) : null)), fixtureIds, 2, 2, rank("xgc")),
      };
    },

    clubMatchColumns(code, season, fixtureIds) {
      const detail = clubDetail(code, season);
      const byFixture = new Map((detail?.matches ?? []).map((m) => [m.fixture, m]));
      // No Totals by design (a sum of chances isn't a figure anyone reads), so
      // the cell is blank, never "—", which means missing data; the Average
      // — the mean chance over the listed matches Understat has — is
      // coloured against every club's that season, as the log's FPL columns
      // are: more wins better, more defeats worse. A draw is neither.
      const column = (key: "win" | "draw" | "loss", header: string, what: string, higherIsBetter: boolean | null): ExternalMatchColumn => {
        const c = counted(fixtureIds.map((f) => byFixture.get(f)?.[key] ?? null));
        const average = c === null ? null : c.sum / c.n;
        const league = (detail?.league ?? []).map((c) => c[key]);
        const averageTint = higherIsBetter === null ? undefined : percentileTint(leagueChanceRank(average, league, higherIsBetter));
        return {
          key: `us-${key}`,
          header,
          title: `Understat: the chance of ${what} given the shots both sides took, worked out after the match`,
          cell: (fixture) => pct(byFixture.get(fixture)?.[key] ?? null),
          total: "",
          average: coverage(pct(average), c),
          averageTint,
        };
      };
      return [column("win", "Win Chance", "a win", true), column("draw", "Draw Chance", "a draw", null), column("loss", "Loss Chance", "a defeat", false)];
    },

    clubMatchAlternates(code, season, fixtureIds) {
      const byFixture = new Map((clubDetail(code, season)?.matches ?? []).map((m) => [m.fixture, m]));
      const values = (get: (m: UsClubSeasonDetail["matches"][number]) => number | null) =>
        new Map(fixtureIds.map((f) => [f, byFixture.has(f) ? get(byFixture.get(f)!) : null]));
      const rank = (key: string) =>
        compare ? (shown: { total: number | null; average: number | null }) => clubLogRanks(compare, code, season, CLUB_LOG_FIGURES[key].value, shown, CLUB_LOG_FIGURES[key].higherIsBetter) : undefined;
      return {
        a: alternate("a", values((m) => m.assists), fixtureIds, 0, 2, rank("a")),
        xg: alternate("xg", values((m) => m.xG), fixtureIds, 2, 2, rank("xg")),
        xa: alternate("xa", values((m) => m.xA), fixtureIds, 2, 2, rank("xa")),
        xgi: alternate("xgi", values((m) => sumOrNull(m.xG, m.xA)), fixtureIds, 2, 2, rank("xgi")),
        xgc: alternate("xgc", values((m) => m.xGA), fixtureIds, 2, 2, rank("xgc")),
      };
    },

    playerCards(code, view, position) {
      // The Summary (summary.ts), then the shot maps: shots taken for every outfield player; shots faced for defenders and
      // goalkeepers (owner's decision, 2026-10-21) — a goalkeeper's own shots are next to none, so his map is the shots he
      // faced alone. The same order as FPL's Views: Summary, then the graphs.
      const taken = position !== "GKP";
      const facing = position === "GKP" || position === "DEF";
      const title = taken && facing ? "Shot Maps" : taken ? "Shot Map · Taken" : "Shot Map · Faced";
      if (view.seasons === null) return <StatusCard title="Summary" wide>Loading…</StatusCard>;
      if (view.seasons.length === 0) return <StatusCard title="Summary" wide>No seasons in this view.</StatusCard>;
      const smallSampleNote =
        compare && !playerShotsEligible(compare, code, view.seasons)
          ? `Small sample: under ${floorFor(compare, view.seasons[view.seasons.length - 1])} of Understat's minutes in ${view.seasons.length > 1 ? "every season here" : "this season"}, so these figures have no colours.`
          : null;
      const got = gather<UsPlayerSeasonDetail>(loads, view.seasons.map((s) => playerKey(code, s)));
      const summary = summaryCard(code, view.seasons, view.mode, position, smallSampleNote);
      const mapStatus = (text: React.ReactNode) => (
        <>
          {summary.card}
          <StatusCard title={title} wide>
            {text}
          </StatusCard>
        </>
      );
      if (got.state === "loading") return mapStatus("Loading…");
      if (got.state === "error") return mapStatus("Couldn't load Understat's shots.");
      // Nothing from Understat for this view at all: the Summary says so, once.
      if (got.details.length === 0) return summary.state === "none" ? summary.card : mapStatus(<>No Understat record for this view ({DASH}).</>);
      const n = got.details.length;
      const label = seasonsLabel(view, n);
      let takenCard: React.ReactNode = null;
      if (taken) {
        const shots = got.details.flatMap((d) => d.shots);
        const shown = shotFigures(shots, n);
        const ranks = compare
          ? playerShotRanks(
              compare,
              code,
              view.seasons,
              SHOT_FIGURE_KEYS.map((key) => ({
                key,
                higherIsBetter: true,
                perSeason: !SHOT_RATE_KEYS.has(key),
                shown: shown[key],
                get: (t: UsPlayerTotals) => summaryShotParts(t.shots, t.shotsOnTarget, t.situations)[key],
              })),
            )
          : undefined;
        takenCard = (
          <ShotCard
            title="Shot Map · Taken"
            shots={shots}
            seasons={n}
            label={`Shots taken, ${label}`}
            heading={statsHeading(view, n)}
            wide
            ranks={ranks}
            smallSampleNote={smallSampleNote}
          />
        );
      }
      let facedCard: React.ReactNode = null;
      if (facing) {
        // A season from before the profile files carried each match's club has no shots faced: unknown, so the map waits rather than leaving it out.
        const faced = got.details.every((d) => d.shotsFaced !== null) ? got.details.flatMap((d) => d.shotsFaced!) : null;
        facedCard =
          faced === null ? (
            <StatusCard title="Shot Map · Faced" wide>
              Not available for this view yet ({DASH}).
            </StatusCard>
          ) : (
            <ShotCard
              title="Shot Map · Faced"
              titleHint={SHOTS_FACED_HINT}
              shots={faced}
              seasons={n}
              label={`Shots faced while he was on the pitch, ${label}`}
              heading={statsHeading(view, n)}
              wide
              faced
              ranks={compare ? playerFacedRanks(compare, code, view.seasons, FACED_PARTS) : undefined}
              smallSampleNote={smallSampleNote}
            />
          );
      }
      return (
        <>
          {summary.card}
          {takenCard}
          {facedCard}
        </>
      );
    },

    clubCards(code, view) {
      const title = "Shot Maps";
      if (view.seasons === null) return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (view.seasons.length === 0) return <StatusCard title={title} wide>No seasons in this view.</StatusCard>;
      const got = gather<UsClubSeasonDetail>(loads, view.seasons.map((s) => clubKey(code, s)));
      if (got.state === "loading") return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (got.state === "error") return <StatusCard title={title} wide>Couldn't load Understat's club figures.</StatusCard>;
      if (got.details.length === 0) return <StatusCard title={title} wide>No Understat record for this view ({DASH}).</StatusCard>;
      const n = got.details.length;
      const label = seasonsLabel(view, n);
      const taken = got.details.flatMap((d) => d.shots);
      const faced = got.details.flatMap((d) => d.shotsAgainst);
      // Shots faced: fewer is better.
      const clubRanksFor = (list: UsShot[], forClub: boolean) => {
        if (!compare) return undefined;
        const shown = shotFigures(list, n);
        return clubShotRanks(
          compare,
          code,
          view.seasons!,
          (t) => (forClub ? t.shotsCompleteFor : t.shotsCompleteAgainst),
          SHOT_FIGURE_KEYS.map((key) => ({
            key,
            higherIsBetter: forClub,
            perSeason: !SHOT_RATE_KEYS.has(key),
            shown: shown[key],
            get: (t: UsClubTotals) =>
              (forClub ? summaryShotParts(t.shots, t.shotsOnTarget, t.situationsFor) : summaryShotParts(t.shotsAgainst, t.shotsOnTargetAgainst, t.situationsAgainst))[key],
          })),
        );
      };
      return (
        <>
          <ShotCard title="Shot Map · Taken" shots={taken} seasons={n} label={`Shots taken, ${label}`} heading={statsHeading(view, n)} wide ranks={clubRanksFor(taken, true)} />
          <ShotCard title="Shot Map · Faced" shots={faced} seasons={n} label={`Shots faced, ${label}`} heading={statsHeading(view, n)} wide faced ranks={clubRanksFor(faced, false)} />
        </>
      );
    },

    clubFormations(code, season) {
      return <FormationsSection code={code} season={season} load={loads.get(clubKey(code, season)) as DetailLoad<UsClubSeasonDetail> | undefined} request={request.club} compare={compare} />;
    },
  };
}
