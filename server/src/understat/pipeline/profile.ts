/**
 * Builds one season's profile file (data/understat/app/profile/<season>.json):
 * the per-match detail behind the player and team profiles — where each
 * linked player played in each match and every shot he took, and each
 * club's shots, its post-match result chances and its formations.
 *
 * Same rules as the season summaries (aggregate.ts): only matches paired
 * with a finished FPL fixture count (so checked against FPL), players by
 * confirmed link only, clubs by what the CLUB did whoever played. Every
 * row carries its FPL fixture id. Own goals are nobody's shots.
 */
import type { SeasonData } from "./files.js";
import type { AppProfileFile, PlayerLink, ProfileFormation, ProfileShotRow, UsFormation, UsShot } from "./types.js";

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

function shotRow(fixture: number, s: UsShot): ProfileShotRow {
  return [fixture, s.minute, round(s.x, 3), round(s.y, 3), round(s.xG, 4), s.result, s.situation, s.shotType];
}

/**
 * `matchByFixture`: this run's pairing, FPL fixture id -> Understat match id.
 * `formations`: the season's stored formation figures, or null when they
 * haven't been fetched yet (every club's is then null, shown "—").
 */
export function buildProfileSeason(
  data: SeasonData,
  links: Map<number, PlayerLink>,
  matchByFixture: Map<number, string>,
  formations: UsFormation[] | null,
): AppProfileFile {
  const fixtureByMatch = new Map<string, number>();
  for (const [fixture, matchId] of matchByFixture) fixtureByMatch.set(matchId, fixture);
  const matchById = new Map(data.matches.filter((m) => m.isResult && fixtureByMatch.has(m.id)).map((m) => [m.id, m]));

  const codeByUnderstatId = new Map<string, number>();
  for (const l of links.values()) if (l.status === "confirmed") codeByUnderstatId.set(l.understatId, l.fplCode);
  const codeByTeamId = new Map(data.clubs.map((c) => [c.understatTeamId, c.fplTeamCode]));

  const players: AppProfileFile["players"] = {};
  const playerFor = (understatId: string) => {
    const code = codeByUnderstatId.get(understatId);
    if (code === undefined) return null;
    return (players[code] ??= { matches: [], shots: [] });
  };
  const clubs: AppProfileFile["clubs"] = {};
  const clubFor = (teamId: string) => {
    const code = codeByTeamId.get(teamId);
    if (code === undefined) return null;
    return (clubs[code] ??= { matches: [], shots: [], formations: null });
  };

  for (const a of data.appearances) {
    const fixture = fixtureByMatch.get(a.matchId);
    if (fixture === undefined || !matchById.has(a.matchId) || a.minutes <= 0) continue;
    playerFor(a.playerId)?.matches.push([fixture, a.position, a.minutes]);
  }

  for (const m of matchById.values()) {
    const fixture = fixtureByMatch.get(m.id)!;
    // Understat's forecast is home win / draw / away win.
    clubFor(m.homeTeamId)?.matches.push([fixture, m.forecastWin, m.forecastDraw, m.forecastLoss]);
    clubFor(m.awayTeamId)?.matches.push([fixture, m.forecastLoss, m.forecastDraw, m.forecastWin]);
  }

  for (const s of data.shots) {
    const m = matchById.get(s.matchId);
    if (!m || s.result === "OwnGoal") continue;
    const row = shotRow(fixtureByMatch.get(s.matchId)!, s);
    playerFor(s.playerId)?.shots.push(row);
    clubFor(s.side === "h" ? m.homeTeamId : m.awayTeamId)?.shots.push(row);
  }

  if (formations) {
    const byTeam = new Map<string, ProfileFormation[]>();
    for (const f of formations) {
      const { teamId, ...rest } = f;
      const list = byTeam.get(teamId) ?? [];
      list.push({ ...rest, xG: round(rest.xG, 4), xGA: round(rest.xGA, 4) });
      byTeam.set(teamId, list);
    }
    for (const [teamId, list] of byTeam) {
      const club = clubFor(teamId);
      if (club) club.formations = list.sort((a, b) => b.minutes - a.minutes);
    }
    // A club with no stored formations this season (its page didn't check out) stays null, "—".
  }

  const byFixture = (a: [number, ...unknown[]], b: [number, ...unknown[]]) => a[0] - b[0];
  for (const p of Object.values(players)) {
    p.matches.sort(byFixture);
    p.shots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  for (const c of Object.values(clubs)) {
    c.matches.sort(byFixture);
    c.shots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return { schema: 1, season: data.season, players, clubs };
}
