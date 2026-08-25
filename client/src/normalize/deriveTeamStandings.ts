import type { NormalizedFixture, NormalizedTeam } from "../types/normalized";

/**
 * bootstrap-static's own team.played/wins/draws/losses fields were
 * confirmed (directly against the live 2026/27 API, not assumed) to stay
 * at their pre-season zero values even after Gameweek 1 finished with
 * real results — not a processing-lag quirk that resolves itself on a
 * later fetch, since it was still true on every subsequent refresh this
 * app made. Those raw fields are never trusted for anything derived from
 * "has this team actually played yet" — finished fixtures (each carrying
 * a real final score, confirmed reliable) are recomputed into the same
 * played/wins/draws/losses shape instead, and used everywhere those
 * fields would otherwise have been read.
 */
export function applyRealTeamStandings(teams: NormalizedTeam[], fixtures: NormalizedFixture[]): NormalizedTeam[] {
  const standings = new Map<number, { played: number; wins: number; draws: number; losses: number }>();

  const get = (teamId: number) => {
    let s = standings.get(teamId);
    if (!s) {
      s = { played: 0, wins: 0, draws: 0, losses: 0 };
      standings.set(teamId, s);
    }
    return s;
  };

  for (const f of fixtures) {
    if (!f.finished || f.homeScore === null || f.awayScore === null) continue;
    const home = get(f.homeTeamId);
    const away = get(f.awayTeamId);
    home.played += 1;
    away.played += 1;
    if (f.homeScore > f.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (f.homeScore < f.awayScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
    }
  }

  return teams.map((t) => {
    const s = standings.get(t.id);
    // No finished fixtures found for this team (genuinely pre-season, or
    // fixtures haven't loaded yet) — leave the raw values as-is; they're
    // correctly 0 in that case anyway.
    if (!s) return t;
    return { ...t, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses };
  });
}
