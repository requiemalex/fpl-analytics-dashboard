import type { RawFixture } from "../types/raw";
import type { NormalizedFixture } from "../types/normalized";

export function normalizeFixtures(rawFixtures: RawFixture[]): NormalizedFixture[] {
  return rawFixtures.map((f) => ({
    id: f.id,
    eventId: f.event,
    homeTeamId: f.team_h,
    awayTeamId: f.team_a,
    homeScore: f.team_h_score,
    awayScore: f.team_a_score,
    kickoffTime: f.kickoff_time,
    finished: f.finished,
    homeDifficulty: f.team_h_difficulty,
    awayDifficulty: f.team_a_difficulty,
  }));
}
