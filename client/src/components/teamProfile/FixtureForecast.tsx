import React from "react";
import type { FixtureForecast, UpcomingForecast } from "../../metrics/fixtureForecast";
import { rankAmong } from "../../metrics/comparativeColour";
import { percentileTint } from "../../utils/colorScale";
import { fixtureHint } from "../hoverText";
import { DASH, fmtDecimal, fmtPercent } from "../../utils/format";

/**
 * The Team Profile's Fixture Forecast (<fixture_forecast>,
 * metrics/fixtureForecast.ts): a club's next fixtures, each with the goals
 * it can expect for and against and its chance of a clean sheet, of
 * scoring and of each result; Totals (goals added up, a chance column's
 * expected number of matches) and Average (per fixture) under them, as the
 * Match Log has. Forward-looking, so no minutes floor and no Data View.
 *
 * Colours (<comparative_colouring>): a fixture's figure ranked among every
 * club's upcoming fixtures in the table, a club's Totals and Average among
 * every club's; fewer goals conceded and defeats better, a draw neither.
 */

type Key = keyof FixtureForecast;

const COLUMNS: { key: Key; header: string; title: string; chance: boolean; higherIsBetter: boolean | null }[] = [
  { key: "goalsFor", header: "Exp. Goals", title: "Goals the club can expect to score", chance: false, higherIsBetter: true },
  { key: "goalsAgainst", header: "Exp. Conceded", title: "Goals the club can expect to concede", chance: false, higherIsBetter: false },
  { key: "cleanSheet", header: "Clean Sheet", title: "Chance of not conceding", chance: true, higherIsBetter: true },
  { key: "scores", header: "To Score", title: "Chance of scoring at least once", chance: true, higherIsBetter: true },
  { key: "win", header: "Win", title: "Chance of a win", chance: true, higherIsBetter: true },
  { key: "draw", header: "Draw", title: "Chance of a draw", chance: true, higherIsBetter: null },
  { key: "loss", header: "Loss", title: "Chance of a defeat", chance: true, higherIsBetter: false },
];

const sum = (rows: UpcomingForecast[], key: Key): number | null => {
  const known = rows.flatMap((r) => (r.forecast ? [r.forecast[key]] : []));
  return known.length === 0 ? null : known.reduce((s, v) => s + v, 0);
};
const mean = (rows: UpcomingForecast[], key: Key): number | null => {
  const known = rows.filter((r) => r.forecast).length;
  const total = sum(rows, key);
  return total === null ? null : total / known;
};

/** `all`: every club's forecast fixtures (forecastUpcomingFixtures), by team id. */
export function FixtureForecastTable({ teamId, teamName, all }: { teamId: number; teamName: string; all: Map<number, UpcomingForecast[]> }) {
  const rows = all.get(teamId) ?? [];
  if (rows.length === 0) {
    return (
      <p className="page-subtitle" style={{ margin: 0 }}>
        No fixtures scheduled.
      </p>
    );
  }
  const others = [...all].filter(([id]) => id !== teamId).map(([, r]) => r);
  const tint = (key: Key, higherIsBetter: boolean | null, value: number | null, pool: (number | null)[]) =>
    higherIsBetter === null ? undefined : percentileTint(rankAmong(value, pool.filter((v): v is number => v !== null), higherIsBetter));
  // A fixture's figure among every other upcoming fixture in the table, every club's.
  const fixturePool = (key: Key, fixtureId: number) => [
    ...others.flatMap((rs) => rs.map((r) => r.forecast?.[key] ?? null)),
    ...rows.filter((r) => r.fixture.fixtureId !== fixtureId).map((r) => r.forecast?.[key] ?? null),
  ];
  const cell = (key: Key, v: number | null) => (v === null ? DASH : COLUMNS.find((c) => c.key === key)!.chance ? fmtPercent(v * 100, 0) : fmtDecimal(v, 2));

  return (
    <div className="table-wrap">
      <table className="data-table compact" aria-label={`${teamName} fixture forecast`}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>GW</th>
            <th style={{ textAlign: "left" }}>Opponent</th>
            {COLUMNS.map((c, i) => (
              <th key={c.key} className={i === 0 ? "column-group-divider" : undefined} title={c.title}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fixture.fixtureId}>
              <td style={{ textAlign: "left" }}>{r.gameweek ?? DASH}</td>
              <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }} title={fixtureHint(r.fixture)}>
                {r.fixture.opponentShortName} <span className="team">({r.fixture.isHome ? "H" : "A"})</span>
              </td>
              {COLUMNS.map((c, i) => {
                const v = r.forecast?.[c.key] ?? null;
                return (
                  <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: tint(c.key, c.higherIsBetter, v, fixturePool(c.key, r.fixture.fixtureId)) }}>
                    {cell(c.key, v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="table-footer">
          {(["total", "average"] as const).map((row) => (
            <tr key={row} style={row === "total" ? { fontWeight: 600 } : undefined}>
              <td
                className="table-footer-label"
                colSpan={2}
                title={row === "total" ? "Over these fixtures: goals added up, and each chance as the matches it's expected in" : "Per fixture"}
              >
                {row === "total" ? "Totals" : "Average"}
              </td>
              {COLUMNS.map((c, i) => {
                const of = row === "total" ? sum : mean;
                const v = of(rows, c.key);
                const shown = v === null ? DASH : row === "total" ? fmtDecimal(v, 1) : cell(c.key, v);
                return (
                  <td key={c.key} className={i === 0 ? "column-group-divider" : undefined} style={{ background: tint(c.key, c.higherIsBetter, v, others.map((rs) => of(rs, c.key))) }}>
                    {shown}
                  </td>
                );
              })}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
