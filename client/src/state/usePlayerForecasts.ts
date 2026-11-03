import { useCallback, useMemo } from "react";
import { useAppState } from "./AppStateContext";
import { fplOfficialForFixture, fplSeasonRate } from "../metrics/expectedPoints";
import { modelClubRatings, modelForFixture, playerEvidence } from "../metrics/pointsModelLive";
import { fixtureOddsByTeam, type FixtureOdds } from "../metrics/fixtureOdds";
import { clubSeasonsAsShown } from "../metrics/teamStats";
import { expectationForGameweek, upcomingGameweeks, type GameweekExpectation } from "../metrics/gameweekExpectations";
import { getUpcomingFixtures, firstPickableEventId, type UpcomingFixture } from "../metrics/fixtureTicker";

/** Next 5 Fixtures, the pitch's fixture chips and their odds: five matches. */
export const FIXTURE_TICKER_LENGTH = 5;

/**
 * <player_forecasts>: every forward-looking figure the app shows for a
 * player, worked out one way for every place that shows it (the owner's
 * call, 2026-11-02: Player Explorer, Add Players and Team Building's pitch
 * read the same figures): his club's upcoming fixtures from the next
 * gameweek open for picks (never a match of one already under way: audit
 * 2026-10-18 H1), their odds (<fixture_odds>), and his Exp. Pts and Exp.
 * Mins for each upcoming gameweek (<upcoming_gameweeks>).
 */
export interface PlayerForecasts {
  /** The gameweek open for picks; null with none left. */
  fromEventId: number | null;
  /** The upcoming gameweeks, by FPL's numbering. */
  gameweeks: number[];
  /** Each club's fixtures through the last gameweek looked ahead to (a double can make that more than five). */
  upcomingByTeamId: Map<number, UpcomingFixture[]>;
  /** Each club's next five. */
  fixturesByTeamId: Map<number, UpcomingFixture[]>;
  /** Each club's odds for its next five, by fixture id; null where a club has no rating yet. */
  fixtureOddsByTeamId: Map<number, Map<number, FixtureOdds | null>>;
  /** Each player's figures for each upcoming gameweek, in order (FPL Official, Model Predicted, Exp. Mins); empty while not asked for. */
  expectationsByPlayerId: Map<number, GameweekExpectation[]>;
}

const NO_EXPECTATIONS = new Map<number, GameweekExpectation[]>();

/**
 * The forecasts above. `expectations: false` skips the costly part (every
 * player's Exp. Pts and Exp. Mins), and `odds: false` the club ratings the
 * odds need: Player Explorer works them out only while a column shows
 * them. `host`: a page that already has them (Team Building) hands its
 * own, and nothing here is worked out again.
 */
export function usePlayerForecasts({ expectations, odds = expectations }: { expectations: boolean; odds?: boolean }, host?: PlayerForecasts | null): PlayerForecasts {
  const {
    players,
    teamsById,
    fixtures,
    events,
    historicProfiles,
    historicReferenceSeason,
    historicFetchSkippedPlayerIds,
    seasonMatchesByPlayerId,
    clubSeasons,
    currentSeasonHasStarted,
    totalPlayers,
  } = useAppState();
  const own = !host;

  const fromEventId = useMemo(() => firstPickableEventId(events), [events]);
  const gameweeks = useMemo(() => upcomingGameweeks(events), [events]);
  const upcomingByTeamId = useMemo(() => {
    const map = new Map<number, UpcomingFixture[]>();
    if (!own) return map;
    const lastGameweek = gameweeks.at(-1) ?? null;
    for (const team of teamsById.values()) {
      const upcoming = getUpcomingFixtures(team.id, fixtures, teamsById, Infinity, fromEventId);
      map.set(team.id, lastGameweek === null ? upcoming.slice(0, FIXTURE_TICKER_LENGTH) : upcoming.filter((f, i) => i < FIXTURE_TICKER_LENGTH || (f.eventId !== null && f.eventId <= lastGameweek)));
    }
    return map;
  }, [own, teamsById, fixtures, fromEventId, gameweeks]);
  const fixturesByTeamId = useMemo(() => new Map([...upcomingByTeamId].map(([id, list]) => [id, list.slice(0, FIXTURE_TICKER_LENGTH)])), [upcomingByTeamId]);

  // Model Predicted's club ratings, and the odds: the Fixture Forecast's,
  // from the club records as the Team Profile shows them (<fixture_forecast>).
  const rated = own && (odds || expectations);
  const clubRatings = useMemo(
    () =>
      rated
        ? modelClubRatings(
            clubSeasonsAsShown({ clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted, livePlayerSumsPartial: historicFetchSkippedPlayerIds.length > 0 }),
          )
        : null,
    [rated, clubSeasons, historicReferenceSeason, currentSeasonHasStarted, historicFetchSkippedPlayerIds],
  );
  const fixtureOddsByTeamId = useMemo(() => fixtureOddsByTeam(fixturesByTeamId, teamsById, clubRatings), [fixturesByTeamId, teamsById, clubRatings]);

  const modelFor = useCallback(
    (evidence: ReturnType<typeof playerEvidence> | null, teamId: number, fixture: UpcomingFixture) =>
      modelForFixture(evidence, clubRatings, teamsById.get(teamId)?.code ?? null, teamsById.get(fixture.opponentTeamId)?.code ?? null, fixture, fromEventId),
    [clubRatings, teamsById, fromEventId],
  );
  const working = own && expectations;
  // What Model Predicted knows about every player (<points_model_evidence>).
  const evidenceByPlayerId = useMemo(
    () =>
      working
        ? new Map(players.map((p) => [p.id, playerEvidence(p, historicProfiles.get(p.id), seasonMatchesByPlayerId.get(p.id), historicReferenceSeason, totalPlayers)]))
        : null,
    [working, players, historicProfiles, seasonMatchesByPlayerId, historicReferenceSeason, totalPlayers],
  );
  // FPL Official's season part (<fpl_official>): his points per match he was registered for.
  const fplSeasonRateByPlayerId = useMemo(
    () => (working ? new Map(players.map((p) => [p.id, fplSeasonRate(p, seasonMatchesByPlayerId.get(p.id)?.length)])) : null),
    [working, players, seasonMatchesByPlayerId],
  );
  // Every player's figures for each upcoming gameweek, his matches in each
  // added up: FPL Official (<fpl_official>), and Scoutline's points model
  // (<points_model>) with its expected minutes (<expected_minutes>). Not
  // captain-doubled: the pitch doubles the captain's.
  const expectationsByPlayerId = useMemo(() => {
    if (!evidenceByPlayerId || !fplSeasonRateByPlayerId) return NO_EXPECTATIONS;
    return new Map(
      players.map((p) => [
        p.id,
        gameweeks.map((eventId) =>
          expectationForGameweek(
            upcomingByTeamId.get(p.teamId) ?? [],
            eventId,
            (fixture, index) => fplOfficialForFixture(p, fixture, index, fplSeasonRateByPlayerId.get(p.id) ?? null),
            (fixture) => modelFor(evidenceByPlayerId.get(p.id) ?? null, p.teamId, fixture),
          ),
        ),
      ]),
    );
  }, [players, gameweeks, upcomingByTeamId, fplSeasonRateByPlayerId, evidenceByPlayerId, modelFor]);

  const mine = useMemo(
    () => ({ fromEventId, gameweeks, upcomingByTeamId, fixturesByTeamId, fixtureOddsByTeamId, expectationsByPlayerId }),
    [fromEventId, gameweeks, upcomingByTeamId, fixturesByTeamId, fixtureOddsByTeamId, expectationsByPlayerId],
  );
  return host ?? mine;
}
