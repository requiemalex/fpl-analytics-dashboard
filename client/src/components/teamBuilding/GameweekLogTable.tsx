import React from "react";
import { CHIP_NAME } from "../../metrics/gameweekSummary";
import type { GameweekLog, GameweekLogRow } from "../../state/useGameweekLog";
import type { NormalizedPlayer } from "../../types/normalized";
import { DASH, fmtNumber } from "../../utils/format";
import { PlayerLine } from "./PlayerLine";

/**
 * <gameweek_log>: the active squad's gameweeks, newest first, with Totals
 * and Average under them as every Match Log has. An import shows what FPL
 * keeps for the team (transfers, their cost, ranks, chips); a squad built
 * here shows who captained it. No colour: a manager's points have no pool
 * to rank in (<comparative_colouring>).
 */

interface Column {
  key: string;
  header: string;
  title: string;
  cell: (r: GameweekLogRow) => React.ReactNode;
  /** Over every row; undefined leaves the cell empty. */
  total?: (rows: GameweekLogRow[]) => number | null;
  /** True: the Average row divides the total by the gameweeks. */
  averaged?: boolean;
}

const sumOf = (pick: (r: GameweekLogRow) => number | null) => (rows: GameweekLogRow[]) =>
  rows.every((r) => pick(r) !== null) ? rows.reduce((s, r) => s + (pick(r) as number), 0) : null;

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
    { key: "points", header: "Points", title: "The gameweek's points, before any transfer cost", cell: (r) => fmtNumber(r.points), total: sumOf((r) => r.points), averaged: true },
    { key: "average", header: "Average", title: "Every FPL manager's average that gameweek", cell: (r) => fmtNumber(r.average), total: sumOf((r) => r.average), averaged: true },
    { key: "highest", header: "Highest", title: "The highest score of any FPL manager that gameweek", cell: (r) => fmtNumber(r.highest) },
    { key: "bench", header: "Bench", title: "Points left on the bench", cell: (r) => fmtNumber(r.benchPoints), total: sumOf((r) => r.benchPoints), averaged: true },
    ...(imported
      ? [
          { key: "transfers", header: "Transfers", title: "Transfers made for the gameweek", cell: (r: GameweekLogRow) => fmtNumber(r.transfers), total: sumOf((r) => r.transfers), averaged: true },
          {
            key: "cost",
            header: "Hits",
            title: "Points paid for transfers beyond the free ones",
            cell: (r: GameweekLogRow) => (r.transferCost ? `−${fmtNumber(r.transferCost)}` : fmtNumber(r.transferCost)),
            total: sumOf((r) => r.transferCost),
          },
          { key: "rank", header: "GW Rank", title: "The gameweek's rank among every FPL manager", cell: (r: GameweekLogRow) => fmtNumber(r.rank) },
          { key: "overall", header: "Overall Rank", title: "Overall rank after the gameweek", cell: (r: GameweekLogRow) => fmtNumber(r.overallRank) },
          { key: "chip", header: "Chip", title: "The chip played that gameweek", cell: (r: GameweekLogRow) => (r.chip ? CHIP_NAME[r.chip] : DASH) },
        ]
      : [
          {
            key: "captain",
            header: "Captain",
            title: "Who scored double (the vice-captain when the captain didn't play) and his points so counted",
            cell: (r: GameweekLogRow) => {
              if (!r.captain) return DASH;
              return (
                <span className="gw-log-captain">
                  <PlayerLine player={playersById.get(r.captain.id)} fallbackId={r.captain.id} onViewProfile={onViewProfile} />
                  <span className="num">{fmtNumber(r.captain.points)}</span>
                </span>
              );
            },
          },
        ]),
  ];
  const rows = log.rows;
  const footer = (row: "total" | "average") =>
    columns.map((c) => {
      const total = c.total ? c.total(rows) : null;
      const value = row === "total" ? total : c.averaged && total !== null && rows.length > 0 ? total / rows.length : null;
      // <whole_numbers>: a manager's points run to dozens.
      const text = !c.total || (row === "average" && !c.averaged) ? "" : c.key === "cost" && value ? `−${fmtNumber(value)}` : fmtNumber(value);
      return (
        <td key={c.key} className={c.key === "points" ? "column-group-divider" : undefined}>
          {text}
        </td>
      );
    });

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
          {rows.map((r) => (
            <tr key={r.event}>
              <td style={{ textAlign: "left" }} title={r.finished ? `Gameweek ${r.event}` : `Gameweek ${r.event}, still being played: its figures can change`}>
                {r.event}
                {!r.finished && <span className="gw-log-live">live</span>}
              </td>
              {columns.map((c) => (
                <td key={c.key} className={c.key === "points" ? "column-group-divider" : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="table-footer">
          <tr style={{ fontWeight: 600 }}>
            <td className="table-footer-label" title="Every gameweek above added up">
              Totals
            </td>
            {footer("total")}
          </tr>
          <tr>
            <td className="table-footer-label" title="Per gameweek">
              Average
            </td>
            {footer("average")}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
