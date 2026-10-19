import React from "react";
import type { ExternalMatchColumn, ExternalProfiles, ProfileView } from "../extensions/externalStats";
import { DASH, fmtDecimal, fmtPercent } from "../utils/format";
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

function StatTile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="stat-tile" title={title}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
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
 * A shot map and its figures: shots, on target (scored or saved), goals,
 * xG, non-penalty xG and xG per shot — a season's, or per season over a
 * Historic Average (xG per shot from the totals). `wide` puts the figures
 * beside the map, for a card the full width of the profile.
 */
function ShotCard({ title, shots, seasons, label, wide }: { title: string; shots: UsShot[]; seasons: number; label: string; wide?: boolean }) {
  const per = (n: number) => n / seasons;
  const dp = seasons > 1 ? 1 : 0;
  const goals = shots.filter((s) => s.result === "Goal").length;
  const onTarget = shots.filter((s) => s.result === "Goal" || s.result === "SavedShot").length;
  const xG = shots.reduce((sum, s) => sum + s.xG, 0);
  const npxG = shots.filter((s) => s.situation !== "Penalty").reduce((sum, s) => sum + s.xG, 0);
  const beyond = shots.filter(isBeyondMap).length;
  const suffix = seasons > 1 ? " / Season" : "";
  return (
    <div className={wide ? "card profile-span-2" : "card"}>
      <div className="card-title">{title}</div>
      <div className={wide ? "shot-card-body is-wide" : "shot-card-body"}>
        <ShotMap shots={shots} seasons={seasons} label={label} />
        <div className="stat-tile-grid">
          <StatTile
            label={`Shots${suffix}`}
            value={fmtDecimal(per(shots.length), dp)}
            title={beyond > 0 ? `${fmtDecimal(per(beyond), dp)} of them from further than ${SHOT_MAP_DEPTH} m` : undefined}
          />
          <StatTile label={`On Target${suffix}`} value={fmtDecimal(per(onTarget), dp)} />
          <StatTile label={`Goals${suffix}`} value={fmtDecimal(per(goals), dp)} />
          <StatTile label={`xG${suffix}`} value={fmtDecimal(per(xG), 2)} />
          <StatTile label={`NPxG${suffix}`} value={fmtDecimal(per(npxG), 2)} title="Non-penalty xG" />
          <StatTile label="xG/Shot" value={fmtDecimal(shots.length > 0 ? xG / shots.length : null, 2)} />
        </div>
      </div>
    </div>
  );
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

type FormationRow = UsFormation & { others?: string[] };

/**
 * The rows shown: every formation used for at least a match's worth of
 * minutes, then — when there are two or more briefer ones — a single
 * "Other" row adding them up (named on hover). It gets no rates: a rate
 * across different formations would describe none of them.
 */
function formationRows(formations: UsFormation[]): FormationRow[] {
  const main = formations.filter((f) => f.minutes >= FORMATION_MIN_MINUTES);
  const brief = formations.filter((f) => f.minutes < FORMATION_MIN_MINUTES);
  if (brief.length < 2) return [...main, ...brief];
  const sum = (get: (f: UsFormation) => number) => brief.reduce((s, f) => s + get(f), 0);
  const other: FormationRow = {
    formation: "Other",
    minutes: sum((f) => f.minutes),
    shots: sum((f) => f.shots),
    goals: sum((f) => f.goals),
    xG: sum((f) => f.xG),
    shotsAgainst: sum((f) => f.shotsAgainst),
    goalsAgainst: sum((f) => f.goalsAgainst),
    xGA: sum((f) => f.xGA),
    others: brief.map((f) => f.formation),
  };
  return [...main, other];
}

function FormationsCard({ formations, seasons }: { formations: UsFormation[]; seasons: number }) {
  const total = formations.reduce((s, f) => s + f.minutes, 0);
  const per90 = (v: number, f: FormationRow) => (!f.others && f.minutes >= FORMATION_MIN_MINUTES ? (v / f.minutes) * 90 : null);
  const goalsDp = seasons > 1 ? 1 : 0;
  const rows = formationRows(formations);
  return (
    <div className="card profile-span-2">
      <div className="card-title">Formations</div>
      {formations.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          No matches played yet.
        </p>
      ) : (
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
                const hover = f.others
                  ? `Each used for under ${FORMATION_MIN_MINUTES} minutes: ${f.others.join(", ")}`
                  : f.minutes < FORMATION_MIN_MINUTES
                    ? `Under ${FORMATION_MIN_MINUTES} minutes in this formation: too few for a rate`
                    : undefined;
                return (
                  <tr key={f.formation} title={hover} className={f.others ? "formation-other" : undefined}>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{f.others ? `Other (${f.others.length})` : f.formation}</td>
                    <td style={{ textAlign: "left" }} title={`${fmtDecimal(f.minutes / seasons, 0)} minutes${seasons > 1 ? " a season" : ""}`}>
                      <span className="formation-share" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </span>
                      {share > 0 && share < 1 ? "<1%" : fmtPercent(share, 0)}
                    </td>
                    <td>{fmtDecimal(per90(f.xG, f), 2)}</td>
                    <td>{fmtDecimal(per90(f.xGA, f), 2)}</td>
                    <td>{fmtDecimal(f.goals / seasons, goalsDp)}</td>
                    <td>{fmtDecimal(f.goalsAgainst / seasons, goalsDp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? DASH : fmtPercent(v * 100, 0));

/** A switched Match Log column: each match's figure, and its Totals and Average — "—" when any listed match lacks one, never a part-sum. */
function alternate(key: string, values: Map<number, number | null>, fixtureIds: number[], totalDp: number, averageDp: number): ExternalMatchColumn {
  const all = fixtureIds.map((f) => values.get(f) ?? null);
  const complete = all.length > 0 && all.every((v) => v !== null);
  const total = complete ? all.reduce((s: number, v) => s + v!, 0) : null;
  return {
    key,
    header: key,
    cell: (fixture) => fmtDecimal(values.get(fixture) ?? null, totalDp),
    total: fmtDecimal(total, totalDp),
    average: fmtDecimal(total === null ? null : total / all.length, averageDp),
  };
}

const sumOrNull = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

export function createProfiles(loads: Loads, request: { player: (code: number, seasons: string[]) => void; club: (code: number, seasons: string[]) => void }): ExternalProfiles {
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
      return {
        min: alternate("min", values((m) => m.minutes), fixtureIds, 0, 0),
        a: alternate("a", values((m) => m.assists), fixtureIds, 0, 2),
        xg: alternate("xg", values((m) => m.xG), fixtureIds, 2, 2),
        xa: alternate("xa", values((m) => m.xA), fixtureIds, 2, 2),
        xgi: alternate("xgi", values((m) => sumOrNull(m.xG, m.xA)), fixtureIds, 2, 2),
      };
    },

    clubMatchColumns(code, season, fixtureIds) {
      const byFixture = new Map((clubDetail(code, season)?.matches ?? []).map((m) => [m.fixture, m]));
      const column = (key: "win" | "draw" | "loss", header: string, what: string, results: string): ExternalMatchColumn => {
        const values = fixtureIds.map((f) => byFixture.get(f)?.[key] ?? null);
        const complete = values.length > 0 && values.every((v) => v !== null);
        const total = complete ? values.reduce((s: number, v) => s + v!, 0) : null;
        return {
          key: `us-${key}`,
          header,
          title: `Understat: the chance of ${what} given the shots both sides took, worked out after the match. Totals: the ${results} those chances add up to.`,
          cell: (fixture) => pct(byFixture.get(fixture)?.[key] ?? null),
          total: fmtDecimal(total, 1),
          average: total === null ? DASH : pct(total / values.length),
        };
      };
      return [column("win", "Win Chance", "a win", "wins"), column("draw", "Draw Chance", "a draw", "draws"), column("loss", "Loss Chance", "a defeat", "defeats")];
    },

    clubMatchAlternates(code, season, fixtureIds) {
      const byFixture = new Map((clubDetail(code, season)?.matches ?? []).map((m) => [m.fixture, m]));
      const values = (get: (m: UsClubSeasonDetail["matches"][number]) => number | null) =>
        new Map(fixtureIds.map((f) => [f, byFixture.has(f) ? get(byFixture.get(f)!) : null]));
      return {
        a: alternate("a", values((m) => m.assists), fixtureIds, 0, 2),
        xg: alternate("xg", values((m) => m.xG), fixtureIds, 2, 2),
        xa: alternate("xa", values((m) => m.xA), fixtureIds, 2, 2),
        xgi: alternate("xgi", values((m) => sumOrNull(m.xG, m.xA)), fixtureIds, 2, 2),
        xgc: alternate("xgc", values((m) => m.xGA), fixtureIds, 2, 2),
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
      return <ShotCard title={title} shots={shots} seasons={got.details.length} label={`Shots, ${seasonsLabel(view, got.details.length)}`} wide />;
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
      return (
        <>
          <ShotCard title="Shot Map · Taken" shots={got.details.flatMap((d) => d.shots)} seasons={n} label={`Shots taken, ${label}`} />
          <ShotCard title="Shot Map · Faced" shots={got.details.flatMap((d) => d.shotsAgainst)} seasons={n} label={`Shots faced, ${label}`} />
          {withFormations.length === 0 ? (
            <StatusCard title="Formations" wide>
              Not available for this view yet ({DASH}).
            </StatusCard>
          ) : (
            <FormationsCard formations={combineFormations(withFormations.map((d) => d.formations!))} seasons={withFormations.length} />
          )}
        </>
      );
    },
  };
}
