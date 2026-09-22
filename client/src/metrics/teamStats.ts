import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import type { RadarDataPoint } from "./radarStats";

export interface TeamAggregate {
  teamId: number;
  name: string;
  shortName: string;
  points: number | null;
  goals: number | null;
  assists: number | null;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
  defensiveContributions: number | null;
  cleanSheets: number | null;
  /** Actual goals scored/conceded from finished fixture results — a genuinely different number from xG/xGC, not a duplicate. */
  goalsFor: number | null;
  goalsAgainst: number | null;
}

function sum(values: (number | null)[]): number | null {
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length === 0) return null;
  return nonNull.reduce((a, b) => a + b, 0);
}

/**
 * One aggregate per team, built by summing the current squad's
 * mode-resolved player figures — same current-squad-attribution convention
 * already used by Teams.tsx and TeamDetailOverlay (a transferred player's
 * full total counts for their CURRENT club, not whoever they played for
 * when the points were scored). Shared here so both pages (and the new
 * team radar/colouring) agree on one computation instead of two
 * independently-maintained copies.
 */
export function computeTeamAggregates(teams: NormalizedTeam[], resolvedPlayers: NormalizedPlayer[], fixtures: NormalizedFixture[]): TeamAggregate[] {
  return teams.map((team) => {
    const squad = resolvedPlayers.filter((p) => p.teamId === team.id);
    const finishedFixtures = fixtures.filter((f) => f.finished && (f.homeTeamId === team.id || f.awayTeamId === team.id));
    const goalsFor = sum(finishedFixtures.map((f) => (f.homeTeamId === team.id ? f.homeScore : f.awayScore)));
    const goalsAgainst = sum(finishedFixtures.map((f) => (f.homeTeamId === team.id ? f.awayScore : f.homeScore)));
    return {
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      points: sum(squad.map((p) => p.totalPoints)),
      goals: sum(squad.map((p) => p.goals)),
      assists: sum(squad.map((p) => p.assists)),
      xG: sum(squad.map((p) => p.xG)),
      xA: sum(squad.map((p) => p.xA)),
      xGI: sum(squad.map((p) => p.xGI)),
      xGC: sum(squad.map((p) => p.xGC)),
      defensiveContributions: sum(squad.map((p) => p.defensiveContributions)),
      cleanSheets: sum(squad.map((p) => p.cleanSheets)),
      goalsFor,
      goalsAgainst,
    };
  });
}

/**
 * Same rank/percentile formula as computePositionPercentiles
 * (metrics/percentiles.ts) but over the single pool of all teams — there's
 * no position bucketing at team level. Pre-flipped so a higher returned
 * percentile always means "better", same convention as every other
 * percentile in this app.
 */
export function computeTeamPercentiles(allTeams: TeamAggregate[], metricFn: (t: TeamAggregate) => number | null, higherIsBetter: boolean): Map<number, number | null> {
  const eligible = allTeams.filter((t) => metricFn(t) !== null);
  const values = eligible.map((t) => metricFn(t) as number).sort((a, b) => a - b);
  const n = values.length;

  const result = new Map<number, number | null>();
  for (const t of allTeams) result.set(t.teamId, null);

  for (const t of eligible) {
    const v = metricFn(t) as number;
    let below = 0;
    let equal = 0;
    for (const other of values) {
      if (other < v) below += 1;
      else if (other === v) equal += 1;
    }
    const raw = n <= 1 ? 100 : ((below + equal / 2) / n) * 100;
    result.set(t.teamId, higherIsBetter ? raw : 100 - raw);
  }

  return result;
}

export interface TeamRadarAxis {
  key: string;
  label: string;
  metricFn: (t: TeamAggregate) => number | null;
  higherIsBetter: boolean;
}

export const TEAM_DEFENSE_AXES: TeamRadarAxis[] = [
  { key: "cleanSheets", label: "Clean Sheets", metricFn: (t) => t.cleanSheets, higherIsBetter: true },
  { key: "goalsAgainst", label: "Goals Conceded", metricFn: (t) => t.goalsAgainst, higherIsBetter: false },
  { key: "xGC", label: "xGC", metricFn: (t) => t.xGC, higherIsBetter: false },
  { key: "defensiveContributions", label: "Def. Contributions", metricFn: (t) => t.defensiveContributions, higherIsBetter: true },
];

export const TEAM_OFFENSE_AXES: TeamRadarAxis[] = [
  { key: "goals", label: "Goals", metricFn: (t) => t.goals, higherIsBetter: true },
  { key: "xG", label: "xG", metricFn: (t) => t.xG, higherIsBetter: true },
  { key: "assists", label: "Assists", metricFn: (t) => t.assists, higherIsBetter: true },
  { key: "xA", label: "xA", metricFn: (t) => t.xA, higherIsBetter: true },
  { key: "xGI", label: "xGI", metricFn: (t) => t.xGI, higherIsBetter: true },
];

/** One league-wide-rank percentile per axis, for one team — the team-level counterpart to computeRadarDataForAxes (metrics/radarStats.ts). */
export function computeTeamRadarData(axes: TeamRadarAxis[], team: TeamAggregate, allTeams: TeamAggregate[]): RadarDataPoint[] {
  return axes.map((axis) => {
    const percentile = computeTeamPercentiles(allTeams, axis.metricFn, axis.higherIsBetter).get(team.teamId) ?? null;
    return { key: axis.key, label: axis.label, percentile, rawValue: axis.metricFn(team) };
  });
}
