import React from "react";
import { clubRanks } from "../metrics/comparativeColour";
import { oddsFigureFor, type FixtureOdds, type OddsFigure } from "../metrics/fixtureOdds";
import type { UpcomingFixture } from "../metrics/fixtureTicker";
import type { Position } from "../types/normalized";
import { percentileTint } from "../utils/colorScale";
import { DASH, fmtDecimal, fmtPercent } from "../utils/format";
import { percentileHint, statHover } from "./hoverText";
import { CleanSheetIcon, GamesIcon, GoalsExpectedIcon, OddsIcon } from "./IconToolbar";
import type { SegmentOption } from "./MenuControls";

/**
 * <fixture_odds>: what a player's next five show, the same two ways
 * wherever they're shown (Team Building's pitch, and Next 5 Fixtures in
 * Player Explorer and Add Players: the owner's call, 2026-11-02): Games,
 * the opponents coloured by FPL difficulty, or Odds, his club's Fixture
 * Forecast for each (a goalkeeper's or defender's chance of a clean sheet,
 * a midfielder's or forward's goals expected), each ranked among every
 * club's upcoming fixtures.
 */
export type FixturesView = "games" | "odds";

export const FIXTURES_VIEW_OPTIONS: SegmentOption<FixturesView>[] = [
  { value: "games", icon: <GamesIcon />, title: "Games: who he plays in each of his next five, coloured by FPL difficulty" },
  {
    value: "odds",
    icon: <OddsIcon />,
    title:
      "Odds: Scoutline's Fixture Forecast for his club in each of his next five, under each opponent — a goalkeeper's or defender's chance of a clean sheet (shield), a midfielder's or forward's goals expected (ball)",
  },
];

/** What a position's odds show: its icon, leading the chips, and its name for the hover. */
export const ODDS_KIND: Record<OddsFigure, { icon: (size: number) => React.ReactNode; title: string }> = {
  cleanSheet: { icon: (size) => <CleanSheetIcon size={size} />, title: "Clean sheet chance: his club's, in each of his next five" },
  goalsFor: { icon: (size) => <GoalsExpectedIcon size={size} />, title: "Goals expected: his club's, in each of his next five" },
};

/** One odds figure as shown: a clean sheet chance as a whole percentage, goals expected to one decimal. */
export function fmtOdds(figure: OddsFigure, value: number): string {
  return figure === "cleanSheet" ? fmtPercent(value * 100, 0) : fmtDecimal(value, 1);
}

/** What one match's odds say, for its hover. */
export function oddsDefinition(fixture: UpcomingFixture, figure: OddsFigure, value: number): string {
  const where = `${fixture.opponentShortName} ${fixture.isHome ? "at home" : "away"}`;
  return figure === "cleanSheet"
    ? `${where}: ${fmtOdds(figure, value)} chance of a clean sheet for his club (Fixture Forecast).`
    : `${where}: his club can expect ${fmtDecimal(value, 2)} goals (Fixture Forecast).`;
}

/** Each club's average of each odds figure over its next five; null where a fixture has no forecast yet. */
export interface ClubOdds {
  average: Record<OddsFigure, number | null>;
  /** The average's rank among the clubs (higher better), for its colour and hover. */
  rank: Record<OddsFigure, number | undefined>;
}

export function clubOddsAverages(fixturesByTeamId: ReadonlyMap<number, UpcomingFixture[]>, oddsByTeamId: ReadonlyMap<number, Map<number, FixtureOdds | null>>): Map<number, ClubOdds> {
  const averages = [...fixturesByTeamId].map(([teamId, fixtures]) => {
    const odds = fixtures.map((f) => oddsByTeamId.get(teamId)?.get(f.fixtureId) ?? null);
    const average = (figure: OddsFigure) => (fixtures.length === 0 || odds.some((o) => o === null) ? null : odds.reduce((sum, o) => sum + o!.forecast[figure], 0) / odds.length);
    return { teamId, average: { cleanSheet: average("cleanSheet"), goalsFor: average("goalsFor") } };
  });
  const ranks = (figure: OddsFigure) => clubRanks(averages, { id: (a) => a.teamId, value: (a) => a.average[figure], higherIsBetter: true });
  const cleanSheet = ranks("cleanSheet");
  const goalsFor = ranks("goalsFor");
  return new Map(averages.map((a) => [a.teamId, { average: a.average, rank: { cleanSheet: cleanSheet.get(a.teamId), goalsFor: goalsFor.get(a.teamId) } }]));
}

/** Plain-text Odds for CSV export, as the table shows them: "38% 41% 22% 30% 35% avg 33%". */
export function formatOddsForCsv(fixtures: UpcomingFixture[], odds: Map<number, FixtureOdds | null> | undefined, position: Position, club: ClubOdds | undefined): string {
  if (fixtures.length === 0) return DASH;
  const figure = oddsFigureFor(position);
  const each = fixtures.map((f) => {
    const o = odds?.get(f.fixtureId) ?? null;
    return o ? fmtOdds(figure, o.forecast[figure]) : DASH;
  });
  const average = club?.average[figure] ?? null;
  return `${each.join(" ")} avg ${average === null ? DASH : fmtOdds(figure, average)}`;
}

/**
 * A table's Next 5 Fixtures as Odds: the figure his position reads, a chip
 * per match tinted by its rank among every club's fixtures, then the
 * average, tinted by his club's place among the clubs.
 */
export function OddsChips({
  fixtures,
  odds,
  position,
  club,
}: {
  fixtures: UpcomingFixture[];
  odds: Map<number, FixtureOdds | null> | undefined;
  position: Position;
  club: ClubOdds | undefined;
}) {
  if (fixtures.length === 0) return <span className="value-muted">{DASH}</span>;
  const figure = oddsFigureFor(position);
  const kind = ODDS_KIND[figure];
  const average = club?.average[figure] ?? null;
  const averageRank = club?.rank[figure];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="table-odds-kind" title={kind.title} aria-label={kind.title} role="img">
        {kind.icon(11)}
      </span>
      <div className="table-fixtures">
        {fixtures.map((f) => {
          const o = odds?.get(f.fixtureId) ?? null;
          if (!o) {
            return (
              <span key={f.fixtureId} className="table-fixture-chip is-odds" title={`${f.opponentShortName} ${f.isHome ? "at home" : "away"}: no forecast yet (club records still loading)`}>
                {DASH}
              </span>
            );
          }
          const value = o.forecast[figure];
          const rank = o.rank[figure];
          return (
            <span
              key={f.fixtureId}
              className="table-fixture-chip is-odds"
              style={{ background: percentileTint(rank) }}
              title={statHover(oddsDefinition(f, figure, value), percentileHint(rank, "every club's upcoming fixtures"))}
            >
              {fmtOdds(figure, value)}
            </span>
          );
        })}
      </div>
      <span
        className="table-fixtures-average"
        style={{ background: percentileTint(averageRank), padding: averageRank !== undefined ? "1px 4px" : 0 }}
        title={
          average === null
            ? "No average yet: a fixture has no forecast"
            : statHover(`Average over these ${fixtures.length}: ${fmtOdds(figure, average)}`, percentileHint(averageRank, "the clubs"))
        }
      >
        {average === null ? DASH : fmtOdds(figure, average)}
      </span>
    </div>
  );
}

/** Games or Odds, on Next 5 Fixtures' header: clicking it never sorts, filters or moves the column, as with the source toggle. */
export function FixturesViewPicker({ value, onChange }: { value: FixturesView; onChange: (v: FixturesView) => void }) {
  return (
    <span className="fixtures-view-picker" role="radiogroup" aria-label="Next 5 Fixtures shows">
      {FIXTURES_VIEW_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.title}
          title={o.title}
          className={o.value === value ? "on" : undefined}
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onChange(o.value);
          }}
        >
          {o.icon}
        </button>
      ))}
    </span>
  );
}
