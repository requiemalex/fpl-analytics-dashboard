import React from "react";
import type { ExternalMatchColumn, ExternalProfiles, ProfileView } from "../extensions/externalStats";
import { DASH, fmtDecimal, fmtPercent } from "../utils/format";
import type { DetailLoad, UsClubSeasonDetail, UsFormation, UsPlayerSeasonDetail, UsShot } from "./profileData";
import { ShotMap } from "./ShotMap";

/**
 * What Understat adds to the player and team profiles
 * (extensions/externalStats.ts ExternalProfiles): shot maps and a club's
 * formations for the profile's Data View, and per-match columns for its
 * Match Log — a player's position in each match, a club's chances of each
 * result. Everything is Understat's own figures, by FPL fixture; a season
 * Understat has nothing for is unknown ("—"), never 0.
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="page-subtitle" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

function ShotCard({ title, shots, seasons, label }: { title: string; shots: UsShot[]; seasons: number; label: string }) {
  const per = (n: number) => n / seasons;
  const goals = shots.filter((s) => s.result === "Goal").length;
  const xG = shots.reduce((sum, s) => sum + s.xG, 0);
  const suffix = seasons > 1 ? " / Season" : "";
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <ShotMap shots={shots} seasons={seasons} label={label} />
      <div className="stat-tile-grid" style={{ marginTop: 12 }}>
        <StatTile label={`Shots${suffix}`} value={fmtDecimal(per(shots.length), seasons > 1 ? 1 : 0)} />
        <StatTile label={`Goals${suffix}`} value={fmtDecimal(per(goals), seasons > 1 ? 1 : 0)} />
        <StatTile label={`xG${suffix}`} value={fmtDecimal(per(xG), 2)} />
      </div>
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <Message>{children}</Message>
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

function FormationsCard({ formations, seasons }: { formations: UsFormation[]; seasons: number }) {
  const total = formations.reduce((s, f) => s + f.minutes, 0);
  const per90 = (v: number, f: UsFormation) => (f.minutes >= FORMATION_MIN_MINUTES ? (v / f.minutes) * 90 : null);
  return (
    <div className="card">
      <div className="card-title">Formations</div>
      {formations.length === 0 ? (
        <Message>No matches played yet.</Message>
      ) : (
        <div className="table-wrap">
          <table className="data-table compact" aria-label="Formations">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Formation</th>
                <th style={{ textAlign: "left" }} title={seasons > 1 ? "Share of the club's minutes, over the seasons averaged" : "Share of the club's minutes"}>
                  Time
                </th>
                <th title="xG per 90 minutes in this formation">xG/90</th>
                <th title="xG conceded per 90 minutes in this formation">xGA/90</th>
                <th title={seasons > 1 ? "Goals scored and conceded in this formation, a season" : "Goals scored and conceded in this formation"}>Goals</th>
              </tr>
            </thead>
            <tbody>
              {formations.map((f) => {
                const share = total > 0 ? (f.minutes / total) * 100 : 0;
                const small = f.minutes < FORMATION_MIN_MINUTES;
                return (
                  <tr key={f.formation} title={small ? `Under ${FORMATION_MIN_MINUTES} minutes in this formation: too few for a rate` : undefined}>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{f.formation}</td>
                    <td style={{ textAlign: "left" }} title={`${fmtDecimal(f.minutes / seasons, 0)} minutes${seasons > 1 ? " a season" : ""}`}>
                      <span className="formation-share" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </span>
                      {fmtPercent(share, 0)}
                    </td>
                    <td>{fmtDecimal(per90(f.xG, f), 2)}</td>
                    <td>{fmtDecimal(per90(f.xGA, f), 2)}</td>
                    <td>
                      {fmtDecimal(f.goals / seasons, seasons > 1 ? 1 : 0)}–{fmtDecimal(f.goalsAgainst / seasons, seasons > 1 ? 1 : 0)}
                    </td>
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

export function createProfiles(loads: Loads, request: { player: (code: number, seasons: string[]) => void; club: (code: number, seasons: string[]) => void }): ExternalProfiles {
  return {
    requestPlayer: request.player,
    requestClub: request.club,

    playerMatchColumns(code, season) {
      const load = loads.get(playerKey(code, season)) as DetailLoad<UsPlayerSeasonDetail> | undefined;
      const byFixture = new Map(load?.state === "ready" ? load.detail.matches.map((m) => [m.fixture, m]) : []);
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

    clubMatchColumns(code, season, fixtureIds) {
      const load = loads.get(clubKey(code, season)) as DetailLoad<UsClubSeasonDetail> | undefined;
      const byFixture = new Map(load?.state === "ready" ? load.detail.matches.map((m) => [m.fixture, m]) : []);
      const column = (key: "win" | "draw" | "loss", header: string, what: string): ExternalMatchColumn => {
        const values = fixtureIds.map((f) => byFixture.get(f)?.[key] ?? null);
        const complete = values.length > 0 && values.every((v) => v !== null);
        const total = complete ? values.reduce((s: number, v) => s + v!, 0) : null;
        return {
          key: `us-${key}`,
          header,
          title: `Understat: the chance of ${what} given the shots both sides took, worked out after the match. Totals: the ${what === "a win" ? "wins" : what === "a draw" ? "draws" : "defeats"} those chances add up to.`,
          cell: (fixture) => pct(byFixture.get(fixture)?.[key] ?? null),
          total: fmtDecimal(total, 1),
          average: total === null ? DASH : pct(total / values.length),
        };
      };
      return [column("win", "Win Chance", "a win"), column("draw", "Draw Chance", "a draw"), column("loss", "Loss Chance", "a defeat")];
    },

    playerCards(code, view) {
      const title = "Shot Map";
      if (view.seasons === null) return <StatusCard title={title}>Loading…</StatusCard>;
      if (view.seasons.length === 0) return <StatusCard title={title}>No seasons in this view.</StatusCard>;
      const got = gather<UsPlayerSeasonDetail>(loads, view.seasons.map((s) => playerKey(code, s)));
      if (got.state === "loading") return <StatusCard title={title}>Loading…</StatusCard>;
      if (got.state === "error") return <StatusCard title={title}>Couldn't load Understat's shots.</StatusCard>;
      if (got.details.length === 0) return <StatusCard title={title}>No Understat record for this view ({DASH}).</StatusCard>;
      const shots = got.details.flatMap((d) => d.shots);
      return <ShotCard title={title} shots={shots} seasons={got.details.length} label={`Shots, ${seasonsLabel(view, got.details.length)}`} />;
    },

    clubCards(code, view) {
      if (view.seasons === null) return <StatusCard title="Formations">Loading…</StatusCard>;
      if (view.seasons.length === 0) {
        return <StatusCard title="Formations">No seasons in this view.</StatusCard>;
      }
      const got = gather<UsClubSeasonDetail>(loads, view.seasons.map((s) => clubKey(code, s)));
      if (got.state === "loading") return <StatusCard title="Formations">Loading…</StatusCard>;
      if (got.state === "error") return <StatusCard title="Formations">Couldn't load Understat's club figures.</StatusCard>;
      if (got.details.length === 0) return <StatusCard title="Formations">No Understat record for this view ({DASH}).</StatusCard>;
      const n = got.details.length;
      // Formations are unknown for a season whose figures aren't available, so they count only the seasons that have them.
      const withFormations = got.details.filter((d) => d.formations !== null);
      const label = seasonsLabel(view, n);
      return (
        <>
          {withFormations.length === 0 ? (
            <StatusCard title="Formations">Not available for this view yet ({DASH}).</StatusCard>
          ) : (
            <FormationsCard formations={combineFormations(withFormations.map((d) => d.formations!))} seasons={withFormations.length} />
          )}
          <ShotCard title="Shot Map · Taken" shots={got.details.flatMap((d) => d.shots)} seasons={n} label={`Shots taken, ${label}`} />
          <ShotCard title="Shot Map · Faced" shots={got.details.flatMap((d) => d.shotsAgainst)} seasons={n} label={`Shots faced, ${label}`} />
        </>
      );
    },
  };
}
