import type { NormalizedTeam, Position } from "../types/normalized";
import { rankAmong } from "./comparativeColour";
import { forecastFixture, type ClubRatings, type FixtureForecast } from "./fixtureForecast";
import type { UpcomingFixture } from "./fixtureTicker";

/**
 * <fixture_odds>: the pitch's Fixtures → Odds. Each upcoming fixture's
 * Fixture Forecast (<fixture_forecast>) from the player's club's side, the
 * same figures the Team Profile shows. Club odds, not the player's own: a
 * goalkeeper or defender reads his club's chance of a clean sheet, a
 * midfielder or forward the goals his club can expect. Ranked
 * (<comparative_colouring>) among every club's fixtures in the same
 * ticker, as the Team Profile ranks a fixture among every club's.
 */

export type OddsFigure = "cleanSheet" | "goalsFor";

/** Which club figure a position reads. */
export function oddsFigureFor(position: Position): OddsFigure {
  return position === "GKP" || position === "DEF" ? "cleanSheet" : "goalsFor";
}

export interface FixtureOdds {
  forecast: FixtureForecast;
  /** Percentile among every club's fixtures in the ticker, higher better; null with nothing to rank against. */
  rank: Record<OddsFigure, number | null>;
}

/** Club id → fixture id → its odds; null where either club has no rating (or ratings haven't loaded). */
export function fixtureOddsByTeam(
  fixturesByTeamId: Map<number, UpcomingFixture[]>,
  teamsById: Map<number, NormalizedTeam>,
  ratings: ClubRatings | null,
): Map<number, Map<number, FixtureOdds | null>> {
  const forecasts = new Map<number, Map<number, FixtureForecast | null>>();
  const pool: Record<OddsFigure, number[]> = { cleanSheet: [], goalsFor: [] };
  for (const [teamId, fixtures] of fixturesByTeamId) {
    const code = teamsById.get(teamId)?.code ?? null;
    const byFixture = new Map<number, FixtureForecast | null>();
    for (const f of fixtures) {
      const opponent = teamsById.get(f.opponentTeamId)?.code ?? null;
      const forecast = ratings && code !== null && opponent !== null ? forecastFixture(ratings, code, opponent, f.isHome) : null;
      byFixture.set(f.fixtureId, forecast);
      if (forecast) {
        pool.cleanSheet.push(forecast.cleanSheet);
        pool.goalsFor.push(forecast.goalsFor);
      }
    }
    forecasts.set(teamId, byFixture);
  }
  // Each figure against every other in the pool: itself left out once.
  const others = (list: number[], value: number) => {
    const i = list.indexOf(value);
    return [...list.slice(0, i), ...list.slice(i + 1)];
  };
  const out = new Map<number, Map<number, FixtureOdds | null>>();
  for (const [teamId, byFixture] of forecasts) {
    out.set(
      teamId,
      new Map(
        [...byFixture].map(([fixtureId, forecast]) => [
          fixtureId,
          forecast
            ? {
                forecast,
                rank: {
                  cleanSheet: rankAmong(forecast.cleanSheet, others(pool.cleanSheet, forecast.cleanSheet), true),
                  goalsFor: rankAmong(forecast.goalsFor, others(pool.goalsFor, forecast.goalsFor), true),
                },
              }
            : null,
        ]),
      ),
    );
  }
  return out;
}
