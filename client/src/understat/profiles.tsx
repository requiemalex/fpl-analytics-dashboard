import React from "react";
import type { ExternalMatchColumn, ExternalProfiles, ProfileView } from "../extensions/externalStats";
import { DASH, fmtDecimal, fmtPercent } from "../utils/format";
import { percentileTint } from "../utils/colorScale";
import { sumKnown, type PartialSum } from "../metrics/partialTotals";
import { withCoverage } from "../components/primitives";
import { SmallSampleBadge } from "../components/MinutesFloorBadge";
import { clubLogRanks, clubShotRanks, floorFor, leagueChanceRank, playerLogRanks, playerShotRanks, playerShotsEligible, type UsComparisonContext } from "./comparisons";
import type { UsClubTotals, UsPlayerTotals, UsSlice } from "./schema";
import type { DetailLoad, UsClubSeasonDetail, UsFormation, UsPlayerSeasonDetail, UsShot } from "./profileData";
import { isBeyondMap, ShotMap, SHOT_MAP_DEPTH } from "./ShotMap";

/**
 * What Understat adds to the player and team profiles
 * (extensions/externalStats.ts ExternalProfiles): shot maps and a club's
 * formations for the profile's Data View, and per-match figures for its
 * Match Log — its own columns (a player's position in each match, a club's
 * chances of each result) and its version of the figures both sources have,
 * for the log's ⇄ toggles. Everything is Understat's own figures, by FPL
 * fixture; a season Understat has nothing for is unknown ("—"), never 0.
 *
 * Cards are laid out by the profile's grid (`.profile-grid`): a card with
 * `profile-span-2` takes the full width.
 */

/** Understat's position codes, spelled out on hover. */
const POSITION_NAMES: Record<string, string> = {
  GK: "Goalkeeper",
  DC: "Centre-back",
  DL: "Left-back",
  DR: "Right-back",
  DMC: "Defensive midfield",
  DML: "Defensive midfield, left",
  DMR: "Defensive midfield, right",
  MC: "Central midfield",
  ML: "Left midfield",
  MR: "Right midfield",
  AMC: "Attacking midfield",
  AML: "Attacking midfield, left",
  AMR: "Attacking midfield, right",
  FW: "Forward",
  FWL: "Forward, left",
  FWR: "Forward, right",
  Sub: "Came off the bench",
};

/** A formation's rates need at least a match's worth of minutes in it — the profiles have no minimum-minutes control, so a fixed floor applies. */
export const FORMATION_MIN_MINUTES = 90;

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
 * A shot map and its figures — shots, on target (scored or saved), goals,
 * xG, non-penalty xG and xG per shot — a season's, or per season over a
 * Historic Average (xG per shot from the totals), under one heading naming
 * which. `wide` puts them in a panel beside the map, one row each, for a
 * card the full width of the profile; otherwise they sit under it, three
 * to a row.
 */
/** A shot list's panel figures: counts per season (over `seasons`), xG/Shot over all of them. */
function shotFigures(shots: UsShot[], seasons: number) {
  const xG = shots.reduce((sum, s) => sum + s.xG, 0);
  return {
    shots: shots.length / seasons,
    onTarget: shots.filter((s) => s.result === "Goal" || s.result === "SavedShot").length / seasons,
    goals: shots.filter((s) => s.result === "Goal").length / seasons,
    xG: xG / seasons,
    npxG: shots.filter((s) => s.situation !== "Penalty").reduce((sum, s) => sum + s.xG, 0) / seasons,
    xGPerShot: shots.length > 0 ? xG / shots.length : null,
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
  return {
    shots: [shots, 1],
    onTarget: [onTarget, 1],
    goals: [sliceSum(situations, (x) => x.goals), 1],
    xG: [xG, 1],
    npxG: [sliceSum(situations, (x) => x.xG, true), 1],
    xGPerShot: shots > 0 ? [xG, shots] : null,
  };
}
const SHOT_FIGURE_KEYS: ShotFigureKey[] = ["shots", "onTarget", "goals", "xG", "npxG", "xGPerShot"];

function ShotCard({
  title,
  shots,
  seasons,
  label,
  heading,
  wide,
  ranks,
  smallSampleNote,
}: {
  title: string;
  shots: UsShot[];
  seasons: number;
  label: string;
  heading: string;
  wide?: boolean;
  /** Each figure's comparative rank (<comparative_colouring>), when it has one. */
  ranks?: Partial<Record<ShotFigureKey, number | null>>;
  /** Set when the figures are left uncoloured for being under the minutes floor: the title's amber stopwatch says so (<minutes_marker>). */
  smallSampleNote?: string | null;
}) {
  const dp = seasons > 1 ? 1 : 0;
  const f = shotFigures(shots, seasons);
  const beyond = shots.filter(isBeyondMap).length;
  const rows: { key: ShotFigureKey; label: string; value: string; title?: string }[] = [
    { key: "shots", label: "Shots", value: fmtDecimal(f.shots, dp), title: beyond > 0 ? `${fmtDecimal(beyond / seasons, dp)} of them from further than ${SHOT_MAP_DEPTH} m` : undefined },
    { key: "onTarget", label: "On Target", value: fmtDecimal(f.onTarget, dp), title: "Scored or saved" },
    { key: "goals", label: "Goals", value: fmtDecimal(f.goals, dp) },
    { key: "xG", label: "xG", value: fmtDecimal(f.xG, 2) },
    { key: "npxG", label: "NPxG", value: fmtDecimal(f.npxG, 2), title: "Non-penalty xG" },
    { key: "xGPerShot", label: "xG/Shot", value: fmtDecimal(f.xGPerShot, 2) },
  ];
  return (
    <div className={wide ? "card profile-span-2" : "card"}>
      <div className="card-title">
        {title}
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

/** Each formation's time and shots summed over the seasons; rates from the sums. */
function combineFormations(lists: UsFormation[][]): UsFormation[] {
  const by = new Map<string, UsFormation>();
  for (const list of lists) {
    for (const f of list) {
      const prev = by.get(f.formation);
      by.set(
        f.formation,
        prev
          ? {
              formation: f.formation,
              minutes: prev.minutes + f.minutes,
              shots: prev.shots + f.shots,
              goals: prev.goals + f.goals,
              xG: prev.xG + f.xG,
              shotsAgainst: prev.shotsAgainst + f.shotsAgainst,
              goalsAgainst: prev.goalsAgainst + f.goalsAgainst,
              xGA: prev.xGA + f.xGA,
            }
          : { ...f },
      );
    }
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes);
}

/** Formations shown before the card is expanded: the club's most-used. */
export const FORMATIONS_SHOWN = 3;

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: up ? "rotate(180deg)" : undefined }}>
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The club's formations, most-used first: the top three, and a chevron
 * under them that lists every one used. A formation used for under a
 * match's worth of minutes gets no rates: the cell carries the amber
 * stopwatch (<minutes_marker>), not "—", which means missing data.
 */
function formationNote(f: UsFormation): string {
  return `Minimum minutes: ${fmtDecimal(f.minutes, 0)} min in this formation, under ${FORMATION_MIN_MINUTES}: too few for a per-90 rate.`;
}

function FormationsCard({ formations, seasons }: { formations: UsFormation[]; seasons: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const total = formations.reduce((s, f) => s + f.minutes, 0);
  const per90 = (v: number, f: UsFormation) => (f.minutes >= FORMATION_MIN_MINUTES ? (v / f.minutes) * 90 : null);
  const goalsDp = seasons > 1 ? 1 : 0;
  const rows = expanded ? formations : formations.slice(0, FORMATIONS_SHOWN);
  const more = formations.length > FORMATIONS_SHOWN;
  const toggleLabel = expanded ? `Show the top ${FORMATIONS_SHOWN} only` : `Show all ${formations.length} formations used`;
  return (
    <div className="card profile-span-2">
      <div className="card-title">Formations</div>
      {formations.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          No matches played yet.
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table compact formations-table" aria-label="Formations">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Formation</th>
                  <th style={{ textAlign: "left" }} title={seasons > 1 ? "Share of the club's minutes, over the seasons averaged" : "Share of the club's minutes"}>
                    Time
                  </th>
                  <th title="xG per 90 minutes in this formation">xG/90</th>
                  <th title="xG conceded per 90 minutes in this formation">xGA/90</th>
                  <th title={seasons > 1 ? "Goals scored in this formation, a season" : "Goals scored in this formation"}>Scored</th>
                  <th title={seasons > 1 ? "Goals conceded in this formation, a season" : "Goals conceded in this formation"}>Conceded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const share = total > 0 ? (f.minutes / total) * 100 : 0;
                  return (
                    <tr key={f.formation}>
                      <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{f.formation}</td>
                      <td style={{ textAlign: "left" }} title={`${fmtDecimal(f.minutes / seasons, 0)} minutes${seasons > 1 ? " a season" : ""}`}>
                        <span className="formation-share" aria-hidden="true">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        {share > 0 && share < 1 ? "<1%" : fmtPercent(share, 0)}
                      </td>
                      <td>{f.minutes < FORMATION_MIN_MINUTES ? <SmallSampleBadge note={formationNote(f)} /> : fmtDecimal(per90(f.xG, f), 2)}</td>
                      <td>{f.minutes < FORMATION_MIN_MINUTES ? <SmallSampleBadge note={formationNote(f)} /> : fmtDecimal(per90(f.xGA, f), 2)}</td>
                      <td>{fmtDecimal(f.goals / seasons, goalsDp)}</td>
                      <td>{fmtDecimal(f.goalsAgainst / seasons, goalsDp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {more && (
            <div className="formations-more">
              <button type="button" className="chip chip-icon" onClick={() => setExpanded((v) => !v)} title={toggleLabel} aria-label={toggleLabel} aria-expanded={expanded}>
                <ChevronIcon up={expanded} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
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
const PLAYER_LOG_FIGURES: Record<string, { value: (t: UsPlayerTotals) => number; higherIsBetter: boolean }> = {
  min: { value: (t) => t.minutes, higherIsBetter: true },
  a: { value: (t) => t.assists, higherIsBetter: true },
  xg: { value: (t) => t.xG, higherIsBetter: true },
  xa: { value: (t) => t.xA, higherIsBetter: true },
  xgi: { value: (t) => t.xG + t.xA, higherIsBetter: true },
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

    playerCards(code, view) {
      const title = "Shot Map";
      if (view.seasons === null) return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (view.seasons.length === 0) return <StatusCard title={title} wide>No seasons in this view.</StatusCard>;
      const got = gather<UsPlayerSeasonDetail>(loads, view.seasons.map((s) => playerKey(code, s)));
      if (got.state === "loading") return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (got.state === "error") return <StatusCard title={title} wide>Couldn't load Understat's shots.</StatusCard>;
      if (got.details.length === 0) return <StatusCard title={title} wide>No Understat record for this view ({DASH}).</StatusCard>;
      const shots = got.details.flatMap((d) => d.shots);
      const shown = shotFigures(shots, got.details.length);
      const ranks = compare
        ? playerShotRanks(
            compare,
            code,
            view.seasons,
            SHOT_FIGURE_KEYS.map((key) => ({ key, higherIsBetter: true, perSeason: key !== "xGPerShot", shown: shown[key], get: (t: UsPlayerTotals) => summaryShotParts(t.shots, t.shotsOnTarget, t.situations)[key] })),
          )
        : undefined;
      return (
        <ShotCard
          title={title}
          shots={shots}
          seasons={got.details.length}
          label={`Shots, ${seasonsLabel(view, got.details.length)}`}
          heading={statsHeading(view, got.details.length)}
          wide
          ranks={ranks}
          smallSampleNote={
            compare && !playerShotsEligible(compare, code, view.seasons)
              ? `Small sample: under ${floorFor(compare, view.seasons[view.seasons.length - 1])} of Understat's minutes in ${view.seasons.length > 1 ? "every season here" : "this season"}, so these figures have no colours.`
              : null
          }
        />
      );
    },

    clubCards(code, view) {
      const title = "Shot Maps and Formations";
      if (view.seasons === null) return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (view.seasons.length === 0) return <StatusCard title={title} wide>No seasons in this view.</StatusCard>;
      const got = gather<UsClubSeasonDetail>(loads, view.seasons.map((s) => clubKey(code, s)));
      if (got.state === "loading") return <StatusCard title={title} wide>Loading…</StatusCard>;
      if (got.state === "error") return <StatusCard title={title} wide>Couldn't load Understat's club figures.</StatusCard>;
      if (got.details.length === 0) return <StatusCard title={title} wide>No Understat record for this view ({DASH}).</StatusCard>;
      const n = got.details.length;
      // Formations are unknown for a season whose figures aren't available, so they count only the seasons that have them.
      const withFormations = got.details.filter((d) => d.formations !== null);
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
            perSeason: key !== "xGPerShot",
            shown: shown[key],
            get: (t: UsClubTotals) =>
              (forClub ? summaryShotParts(t.shots, t.shotsOnTarget, t.situationsFor) : summaryShotParts(t.shotsAgainst, t.shotsOnTargetAgainst, t.situationsAgainst))[key],
          })),
        );
      };
      return (
        <>
          <ShotCard title="Shot Map · Taken" shots={taken} seasons={n} label={`Shots taken, ${label}`} heading={statsHeading(view, n)} wide ranks={clubRanksFor(taken, true)} />
          <ShotCard title="Shot Map · Faced" shots={faced} seasons={n} label={`Shots faced, ${label}`} heading={statsHeading(view, n)} wide ranks={clubRanksFor(faced, false)} />
          {withFormations.length === 0 ? (
            <StatusCard title="Formations" wide>
              Not available for this view yet ({DASH}).
            </StatusCard>
          ) : (
            <FormationsCard key={code} formations={combineFormations(withFormations.map((d) => d.formations!))} seasons={withFormations.length} />
          )}
        </>
      );
    },
  };
}
