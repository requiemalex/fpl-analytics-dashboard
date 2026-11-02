import React from "react";
import { CHIP_NAME, pointsAgainstGameweek, rankPercentile } from "../../metrics/gameweekSummary";
import type { GameweekLog, GameweekLogRow } from "../../state/useGameweekLog";
import type { NormalizedPlayer } from "../../types/normalized";
import { percentileTint } from "../../utils/colorScale";
import { DASH, fmtNumber } from "../../utils/format";
import { percentileHint, statHover } from "../hoverText";
import { PlayerLine } from "./PlayerLine";

/**
 * <gameweek_log>: the active squad's gameweeks, newest first, each on its
 * own against every FPL manager who played it: nothing is added up across
 * gameweeks, as squads start in different ones (the owner's call,
 * 2026-11-02). An import shows what FPL keeps for the team (transfers,
 * their cost, gameweek rank, chip); a squad built here shows who captained
 * it. Points are coloured against the gameweek's average and highest
 * (<gameweek_points_colour>), the gameweek rank by its place among the
 * managers ranked (<comparative_colouring>).
 */

interface Column {
  key: string;
  header: string;
  title: string;
  cell: (r: GameweekLogRow) => React.ReactNode;
  /** A 0–100 score to tint the cell with, and its hover. */
  tint?: (r: GameweekLogRow) => { score: number | null; hover: string | undefined };
}

export function GameweekLogTable({
  log,
  playersById,
  onViewProfile,
}: {
  log: GameweekLog;
  playersById: ReadonlyMap<number, NormalizedPlayer>;
  onViewProfile: (playerId: number) => void;
}) {
  const imported = log.source === "fpl";
  const columns: Column[] = [
    {
      key: "points",
      header: "Points",
      title: "The gameweek's points, before any transfer cost",
      cell: (r) => fmtNumber(r.points),
      tint: (r) => ({
        score: pointsAgainstGameweek(r.points, r.average, r.highest),
        hover: `${fmtNumber(r.points)} points against every FPL manager's ${fmtNumber(r.average)} average and ${fmtNumber(r.highest)} highest: greener toward the highest, redder toward 0`,
      }),
    },
    { key: "average", header: "Average", title: "Every FPL manager's average that gameweek", cell: (r) => fmtNumber(r.average) },
    { key: "highest", header: "Highest", title: "The highest score of any FPL manager that gameweek", cell: (r) => fmtNumber(r.highest) },
    { key: "bench", header: "Bench", title: "Points left on the bench", cell: (r) => fmtNumber(r.benchPoints) },
    ...(imported
      ? [
          {
            key: "rank",
            header: "GW Rank",
            title: "The gameweek's rank among every FPL manager",
            cell: (r: GameweekLogRow) => fmtNumber(r.rank),
            tint: (r: GameweekLogRow) => {
              const score = rankPercentile(r.rank, r.rankedCount);
              return { score, hover: statHover(`${fmtNumber(r.rank)} of ${fmtNumber(r.rankedCount)} managers ranked that gameweek.`, percentileHint(score, "FPL managers that gameweek")) };
            },
          },
          { key: "transfers", header: "Transfers", title: "Transfers made for the gameweek", cell: (r: GameweekLogRow) => fmtNumber(r.transfers) },
          {
            key: "cost",
            header: "Hits",
            title: "Points paid for transfers beyond the free ones",
            cell: (r: GameweekLogRow) => (r.transferCost ? `−${fmtNumber(r.transferCost)}` : fmtNumber(r.transferCost)),
          },
          { key: "chip", header: "Chip", title: "The chip played that gameweek", cell: (r: GameweekLogRow) => (r.chip ? CHIP_NAME[r.chip] : DASH) },
        ]
      : [
          {
            key: "captain",
            header: "Captain",
            title: "Who scored double (the vice-captain when the captain didn't play) and his points so counted",
            cell: (r: GameweekLogRow) =>
              r.captain ? (
                <span className="gw-log-captain">
                  <PlayerLine player={playersById.get(r.captain.id)} fallbackId={r.captain.id} onViewProfile={onViewProfile} />
                  <span className="num">{fmtNumber(r.captain.points)}</span>
                </span>
              ) : (
                DASH
              ),
          },
        ]),
  ];

  return (
    <div className="table-wrap">
      <table className="data-table compact" aria-label="Gameweek Log">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }} title="Gameweek">
              GW
            </th>
            {columns.map((c) => (
              <th key={c.key} className={c.key === "points" ? "column-group-divider" : undefined} title={c.title}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.rows.map((r) => (
            <tr key={r.event}>
              <td style={{ textAlign: "left" }} title={r.finished ? `Gameweek ${r.event}` : `Gameweek ${r.event}, still being played: its figures can change`}>
                {r.event}
                {!r.finished && <span className="gw-log-live">live</span>}
              </td>
              {columns.map((c) => {
                const tint = c.tint?.(r);
                return (
                  <td
                    key={c.key}
                    className={c.key === "points" ? "column-group-divider" : undefined}
                    style={tint ? { background: percentileTint(tint.score) } : undefined}
                    title={tint?.hover}
                  >
                    {c.cell(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
