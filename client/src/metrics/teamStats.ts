import type { ClubPlayerSeason, ClubSeason, NormalizedTeam } from "../types/normalized";
import type { AnalysisMode } from "./resolvePlayerStats";
import type { RadarDataPoint } from "./radarStats";
import { HISTORIC_WINDOW_SEASONS, nextSeasonName } from "./historicAnalysis";

/**
 * One club's figures for whichever season(s) a view's Data View selects.
 *
 * <club_not_squad>: every field is what the CLUB did in that season —
 * attributed by the club each player was actually playing for in each
 * match (see server/src/clubHistory) — never what the club's current
 * players did wherever they were. A summer signing's previous season
 * stays with his previous club; a player's contribution this season stays
 * with this club even after he leaves. Team analysis and player analysis
 * are deliberately separate: "what would this signing bring?" belongs in
 * player analysis.
 */
export interface TeamAggregate {
  teamId: number;
  name: string;
  shortName: string;
  /** FPL points scored by the club's players while playing for it — NOT league points (see `leaguePoints`). */
  points: number | null;
  /** Goals scored by the club's own players (excludes opponents' own goals — the like-for-like partner for xG). */
  goals: number | null;
  assists: number | null;
  bonus: number | null;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  /** The club's real xGC, summed per match — see <club_xgc_per_match> in server/src/clubHistory/aggregate.ts. */
  xGC: number | null;
  defensiveContributions: number | null;
  /** Matches conceding 0. */
  cleanSheets: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  leaguePosition: number | null;
  leaguePoints: number | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

/** Everything computeTeamAggregates needs beyond the teams themselves — straight off AppStateContext. */
export interface ClubHistoryContext {
  clubSeasons: ClubSeason[];
  /** The last COMPLETED season (AppStateContext.historicReferenceSeason). Null until historic data has loaded. */
  referenceSeason: string | null;
  currentSeasonHasStarted: boolean;
}

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

function seasonNameFromStartYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/**
 * The season(s) a Data View covers for a club: the live season, the last
 * completed one, or the same HISTORIC_WINDOW_SEASONS-season window a
 * player's Historic Average uses (anchored to the last completed season).
 */
export function clubSeasonsForMode(mode: AnalysisMode, referenceSeason: string | null): string[] {
  if (!referenceSeason) return [];
  if (mode === "live") return [nextSeasonName(referenceSeason)];
  if (mode === "lastSeason") return [referenceSeason];
  const start = seasonStartYear(referenceSeason);
  return Array.from({ length: HISTORIC_WINDOW_SEASONS }, (_, i) => seasonNameFromStartYear(start - i));
}

/** The club-season records a Data View covers for one club, most recent first — empty for a season the club wasn't in the Premier League. */
export function clubRecordsForMode(clubCode: number | null, mode: AnalysisMode, ctx: ClubHistoryContext): ClubSeason[] {
  if (clubCode === null) return [];
  const wanted = clubSeasonsForMode(mode, ctx.referenceSeason);
  return wanted
    .map((season) => ctx.clubSeasons.find((c) => c.season === season && c.code === clubCode))
    .filter((c): c is ClubSeason => c !== undefined);
}

/** Mean of the non-null values; null if there are none — a Historic Average over the seasons a club actually has, never padded with zeros for seasons it wasn't in the league. */
function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
}

function emptyAggregate(team: NormalizedTeam, fill: number | null): TeamAggregate {
  return {
    teamId: team.id,
    name: team.name,
    shortName: team.shortName,
    points: fill,
    goals: fill,
    assists: fill,
    bonus: fill,
    xG: fill,
    xA: fill,
    xGI: fill,
    xGC: fill,
    defensiveContributions: fill,
    cleanSheets: fill,
    goalsFor: fill,
    goalsAgainst: fill,
    leaguePosition: null,
    leaguePoints: fill,
    played: fill,
    wins: fill,
    draws: fill,
    losses: fill,
  };
}

/**
 * One TeamAggregate per current Premier League club, for the given Data
 * View. A single season (Current / Last Completed) reads that season's
 * record directly; Historic Average takes the mean of each field over the
 * window seasons the club was actually in the league. A club with no
 * record for the view (e.g. promoted this season, looking at last season)
 * gets nulls — shown as "—", never 0.
 *
 * Current Season before a ball is kicked is genuinely zero across the
 * board (same convention as resolvePlayerStats' <live_mode_preseason_fix>).
 */
export function computeTeamAggregates(teams: NormalizedTeam[], mode: AnalysisMode, ctx: ClubHistoryContext): TeamAggregate[] {
  return teams.map((team) => {
    const records = clubRecordsForMode(team.code, mode, ctx);
    if (records.length === 0) {
      const preseasonZero = mode === "live" && !ctx.currentSeasonHasStarted && ctx.referenceSeason !== null;
      return emptyAggregate(team, preseasonZero ? 0 : null);
    }
    const pick = (fn: (c: ClubSeason) => number | null) => mean(records.map(fn));
    return {
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      points: pick((c) => c.fantasyPoints),
      goals: pick((c) => c.goals),
      assists: pick((c) => c.assists),
      bonus: pick((c) => c.bonus),
      xG: pick((c) => c.xG),
      xA: pick((c) => c.xA),
      xGI: pick((c) => c.xGI),
      xGC: pick((c) => c.xGC),
      defensiveContributions: pick((c) => c.dc),
      cleanSheets: pick((c) => c.cleanSheets),
      goalsFor: pick((c) => c.goalsFor),
      goalsAgainst: pick((c) => c.goalsAgainst),
      leaguePosition: pick((c) => c.leaguePosition),
      leaguePoints: pick((c) => c.leaguePoints),
      played: pick((c) => c.played),
      wins: pick((c) => c.wins),
      draws: pick((c) => c.draws),
      losses: pick((c) => c.losses),
    };
  });
}

/** One player's figures for one club under a Data View — averaged over the seasons he played for it (Historic Average), never including time at other clubs. */
export type ClubPlayerFigures = Omit<ClubPlayerSeason, "code">;

/**
 * Per-player figures FOR THIS CLUB under a Data View, keyed by player code.
 * A player only appears for seasons he actually played for the club — a
 * summer signing has no entry for last season here, however well he did
 * elsewhere (that's player analysis, not club analysis).
 */
export function clubPlayerFigures(clubCode: number | null, mode: AnalysisMode, ctx: ClubHistoryContext): Map<number, ClubPlayerFigures> {
  const byCode = new Map<number, ClubPlayerSeason[]>();
  for (const record of clubRecordsForMode(clubCode, mode, ctx)) {
    for (const p of record.players) {
      const list = byCode.get(p.code);
      if (list) list.push(p);
      else byCode.set(p.code, [p]);
    }
  }
  const result = new Map<number, ClubPlayerFigures>();
  for (const [code, seasons] of byCode) {
    const avg = (fn: (p: ClubPlayerSeason) => number | null) => mean(seasons.map(fn));
    result.set(code, {
      minutes: avg((p) => p.minutes) ?? 0,
      starts: avg((p) => p.starts),
      totalPoints: avg((p) => p.totalPoints) ?? 0,
      goals: avg((p) => p.goals) ?? 0,
      assists: avg((p) => p.assists) ?? 0,
      cleanSheets: avg((p) => p.cleanSheets) ?? 0,
      bonus: avg((p) => p.bonus) ?? 0,
      xG: avg((p) => p.xG),
      xA: avg((p) => p.xA),
      xGI: avg((p) => p.xGI),
      xGC: avg((p) => p.xGC),
      dc: avg((p) => p.dc),
    });
  }
  return result;
}

export interface ClubSeasonPoints {
  seasonName: string;
  /** FPL points scored by the club's players while playing for it that season. */
  totalPoints: number;
  /** False for the live season. */
  complete: boolean;
}

/** Every season on record for one club, oldest first — seasons it wasn't in the Premier League simply aren't there. */
export function clubSeasonHistory(clubCode: number | null, clubSeasons: ClubSeason[]): ClubSeasonPoints[] {
  if (clubCode === null) return [];
  return clubSeasons
    .filter((c) => c.code === clubCode)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((c) => ({ seasonName: c.season, totalPoints: c.fantasyPoints, complete: c.complete }));
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
