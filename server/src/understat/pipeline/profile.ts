/**
 * Builds one season's profile file (data/understat/app/profile/<season>.json):
 * the per-match detail behind the player and team profiles — where each
 * linked player played in each match, for which club, and every shot he
 * took; and each club's shots, its post-match result chances, its
 * formations and its starting XI in each match.
 *
 * Same rules as the season summaries (aggregate.ts): only matches paired
 * with a finished FPL fixture count (so checked against FPL), players by
 * confirmed link only, clubs by what the CLUB did whoever played. Every
 * row carries its FPL fixture id. Own goals are nobody's shots.
 */
import type { SeasonData } from "./files.js";
import type { AppProfileFile, PlayerLink, ProfileFormation, ProfileLineupRow, ProfileShotRow, UsFormation, UsShot } from "./types.js";

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
    return (clubs[code] ??= { matches: [], shots: [], formations: null, lineups: [] });
  };

  // Each club's starting XI (every line-up entry not off the bench), linked players by FPL code.
  const starters = new Map<string, { fixture: number; teamId: string; xi: ProfileLineupRow[1] }>();
  for (const a of data.appearances) {
    const fixture = fixtureByMatch.get(a.matchId);
    if (fixture === undefined || !matchById.has(a.matchId)) continue;
    if (a.minutes > 0) playerFor(a.playerId)?.matches.push([fixture, a.position, a.minutes, round(a.xG, 4), round(a.xA, 4), a.assists, codeByTeamId.get(a.teamId) ?? null]);
    if (a.position === "Sub") continue;
    const key = `${a.matchId}|${a.teamId}`;
    const entry = starters.get(key) ?? { fixture, teamId: a.teamId, xi: [] };
    entry.xi.push([a.position, codeByUnderstatId.get(a.playerId) ?? null, a.playerName]);
    starters.set(key, entry);
  }
  for (const { fixture, teamId, xi } of starters.values()) clubFor(teamId)?.lineups.push([fixture, xi]);

  // Each club's line in each match, and its players' xA and assists in it.
  const teamLine = new Map(data.teamMatches.map((t) => [`${t.matchId}|${t.teamId}`, t]));
  const created = new Map<string, { xA: number; assists: number }>();
  for (const a of data.appearances) {
    const key = `${a.matchId}|${a.teamId}`;
    const c = created.get(key) ?? { xA: 0, assists: 0 };
    c.xA += a.xA;
    c.assists += a.assists;
    created.set(key, c);
  }
  const clubLine = (m: (typeof data.matches)[number], teamId: string, win: number | null, draw: number | null, loss: number | null) => {
    const line = teamLine.get(`${m.id}|${teamId}`);
    const made = created.get(`${m.id}|${teamId}`) ?? { xA: 0, assists: 0 };
    if (!line) return;
    clubFor(teamId)?.matches.push([fixtureByMatch.get(m.id)!, win, draw, loss, round(line.xG, 4), round(line.xGA, 4), round(made.xA, 4), made.assists]);
  };
  for (const m of matchById.values()) {
    // Understat's forecast is home win / draw / away win.
    clubLine(m, m.homeTeamId, m.forecastWin, m.forecastDraw, m.forecastLoss);
    clubLine(m, m.awayTeamId, m.forecastLoss, m.forecastDraw, m.forecastWin);
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
    c.lineups.sort(byFixture);
    c.shots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return { schema: 1, season: data.season, players, clubs };
}
