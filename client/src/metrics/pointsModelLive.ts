import type { ClubSeason, NormalizedPlayer, PlayerSeasonHistory, SeasonMatch } from "../types/normalized";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import type { UpcomingFixture } from "./fixtureTicker";
import { fitClubRatings, forecastNow, type ClubRatings } from "./fixtureForecast";
import { availabilityModifier } from "./availability";
import { fixtureOutlook, predictMatch, type ModelBreakdown, type PastSeason, type PlayerEvidence, type SeasonTotals, type TransferWindow } from "./pointsModel";
import { MODEL_PARAMS } from "./pointsModelParams.generated";
import { seasonStartYear } from "../utils/season";

/** Past seasons the model reads (the backtest's PAST_SEASONS: client/scripts/pointsModel/history.ts). */
const PAST_SEASONS = 3;

/**
 * The club ratings Model Predicted reads its fixtures from: the Fixture
 * Forecast's, as of the latest match played (<fixture_forecast>) — the
 * same ratings the Team Profile shows, from the same club records. Null
 * while the club records haven't loaded.
 */
export function modelClubRatings(clubSeasons: ClubSeason[]): ClubRatings | null {
  const from = forecastNow(clubSeasons);
  return from ? fitClubRatings(clubSeasons, from.now, from.season) : null;
}

function pastSeason(s: PlayerSeasonHistory, seasonsAgo: number): PastSeason {
  return {
    seasonsAgo,
    minutes: s.minutes,
    starts: s.starts,
    goals: s.goals,
    assists: s.assists,
    xG: s.xG,
    xA: s.xA,
    dc: s.defensiveContribution,
    saves: s.saves,
    bonus: s.bonus,
    yellowCards: s.yellowCards,
    penaltiesTaken: null,
    penaltyGoals: null,
  };
}

/**
 * <points_model_evidence>: what the model knows about a player
 * (PlayerEvidence, pointsModel.ts), from the app's own FPL data — this
 * season's totals (bootstrap), this season's matches (<season_matches>), his
 * completed seasons (history_past, the last three), FPL's availability
 * news, and managers' transfers of him toward the next deadline
 * (liveTransfers). The backtest builds the same evidence from the club
 * records (client/scripts/pointsModel/history.ts <as_of_evidence>).
 *
 * Null — no figure — when his matches this season haven't loaded (the
 * historic build skipped him) or his availability is unknown (no status).
 */
export function playerEvidence(
  player: NormalizedPlayer,
  profile: HistoricPlayerProfile | undefined,
  seasonMatches: SeasonMatch[] | undefined,
  referenceSeason: string | null,
  totalPlayers: number | null,
): PlayerEvidence | null {
  if (seasonMatches === undefined) return null;
  const availability = availabilityModifier(player);
  if (availability === null) return null;

  const current: SeasonTotals | null =
    seasonMatches.length > 0 && player.minutes !== null
      ? {
          minutes: player.minutes,
          starts: player.starts,
          goals: player.goals ?? 0,
          assists: player.assists ?? 0,
          xG: player.xG,
          xA: player.xA,
          dc: player.defensiveContributions,
          saves: player.saves,
          bonus: player.bonus ?? 0,
          yellowCards: player.yellowCards,
          penaltiesTaken: null,
          penaltyGoals: null,
        }
      : null;

  const past: PastSeason[] = [];
  if (referenceSeason !== null) {
    const reference = seasonStartYear(referenceSeason);
    for (const s of profile?.allSeasonsInWindow ?? []) {
      const seasonsAgo = reference - seasonStartYear(s.seasonName) + 1;
      if (seasonsAgo >= 1 && seasonsAgo <= PAST_SEASONS && s.minutes > 0) past.push(pastSeason(s, seasonsAgo));
    }
  }

  return { position: player.position, price: player.price, current, matches: seasonMatches, past, penaltyTaker: null, availability, transfers: liveTransfers(player, totalPlayers) };
}

/**
 * <transfer_signal>, live: FPL's transfers of him since the last deadline
 * (`transfers_in_event` / `transfers_out_event`, which count toward the
 * NEXT deadline) and his owners now (ownership % × total managers). The
 * window fills up as the week goes on, so early in it the signal is
 * partial — it carries its full, fitted weight only by the deadline. Null
 * when any of them is missing.
 */
export function liveTransfers(player: NormalizedPlayer, totalPlayers: number | null): TransferWindow | null {
  if (player.transfersInEvent === null || player.transfersOutEvent === null || player.ownership === null || !totalPlayers) return null;
  return { in: player.transfersInEvent, out: player.transfersOutEvent, owners: (player.ownership / 100) * totalPlayers };
}

/**
 * One player's Model Predicted breakdown for one upcoming match; null
 * without evidence, ratings, or either club's code. His transfers count
 * only toward the gameweek they're being made for (`transfersGameweek`,
 * the next deadline's): the model was fitted on each deadline's own.
 */
export function modelForFixture(
  evidence: PlayerEvidence | null,
  ratings: ClubRatings | null,
  clubCode: number | null,
  opponentCode: number | null,
  fixture: UpcomingFixture,
  transfersGameweek: number | null,
): ModelBreakdown | null {
  if (evidence === null || ratings === null || clubCode === null || opponentCode === null) return null;
  const outlook = fixtureOutlook(ratings, clubCode, opponentCode, fixture.isHome);
  if (!outlook) return null;
  const e = evidence.transfers !== null && fixture.eventId !== transfersGameweek ? { ...evidence, transfers: null } : evidence;
  return predictMatch(e, outlook, MODEL_PARAMS);
}
