import React from "react";
import { SmallSampleBadge } from "../MinutesFloorBadge";
import { COMPARISON_GROUP_LABELS, COMPARISON_GROUP_ORDER } from "../../metrics/comparisonMetrics";
import type { ColumnGroup } from "../playerColumns";
import type { LegendEntry } from "./ComparisonLegend";

export interface OutputsRow {
  key: string;
  label: string;
  group: ColumnGroup;
  higherIsBetter: boolean;
  format: (v: number | null) => string;
  /** Per player id: his figure. */
  cells: Map<number, number | null>;
}

/** The ranked players' figures in a row (those at or above the card's minimum minutes). */
function rankedValues(row: OutputsRow, ranked: LegendEntry[]): number[] {
  return ranked.map((e) => row.cells.get(e.player.id) ?? null).filter((v): v is number => v !== null);
}

/** The value to bold in a row: the best among the ranked players, when at least two have one and they differ. */
function bestValue(row: OutputsRow, ranked: LegendEntry[]): number | null {
  const values = rankedValues(row, ranked);
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return null;
  return row.higherIsBetter ? max : min;
}

/**
 * Each metric as a row: a track running from 0 to the highest figure among
 * the compared players, with each player's marker at his own figure — so
 * the gaps are to scale (239 vs 142 points: a full track vs about 60%) —
 * then each player's figure in his colour, the best in bold. Every row has
 * its own scale, since its units differ. The faint ticks are a quarter,
 * half and three quarters of the leader. The column headers are the
 * players, in the same order and colours as the tags above. A player under
 * the card's minimum minutes (the fixed floor on the Starter view) has no
 * marker, doesn't set the scale and can't be bold: his figures are muted.
 */
export function ComparisonOutputs({ rows, entries }: { rows: OutputsRow[]; entries: LegendEntry[] }) {
  const ranked = entries.filter((e) => !e.smallSampleNote);
  const groups = COMPARISON_GROUP_ORDER.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) })).filter((g) => g.rows.length > 0);
  return (
    <div className="cmp-outputs" style={{ gridTemplateColumns: `minmax(84px, max-content) minmax(72px, 1fr) repeat(${entries.length}, minmax(44px, max-content))` }}>
      <div className="cmp-outputs-row cmp-outputs-head">
        <span />
        <span />
        {entries.map(({ player, color, smallSampleNote }) => (
          <span key={player.id} className="cmp-outputs-player" style={{ color: smallSampleNote ? "var(--text-muted)" : color }} title={player.name}>
            <span className="cmp-outputs-player-name">{player.name}</span>
            {smallSampleNote && <SmallSampleBadge note={smallSampleNote} />}
          </span>
        ))}
      </div>
      {groups.map(({ group, rows: groupRows }) => (
        <React.Fragment key={group}>
          <div className="cmp-outputs-group">{COMPARISON_GROUP_LABELS[group]}</div>
          {groupRows.map((row) => {
            const best = bestValue(row, ranked);
            const leader = Math.max(0, ...rankedValues(row, ranked));
            return (
              <div key={row.key} className="cmp-outputs-row">
                <span className="cmp-outputs-label">{row.label}</span>
                <span
                  className="cmp-outputs-track"
                  title={`0 to ${row.format(leader)}, the highest here${row.higherIsBetter ? "" : "; fewer is better for this one"}`}
                >
                  {leader > 0 &&
                    ranked.map(({ player, color }) => {
                      const value = row.cells.get(player.id) ?? null;
                      if (value === null) return null;
                      const pct = (Math.max(0, value) / leader) * 100;
                      return (
                        <span
                          key={player.id}
                          className="cmp-outputs-marker"
                          style={{ left: `${pct}%`, background: color }}
                          title={`${player.name}: ${row.format(value)} (${Math.round(pct)}% of the leader)`}
                        />
                      );
                    })}
                </span>
                {entries.map(({ player, color, smallSampleNote }) => {
                  const value = row.cells.get(player.id) ?? null;
                  const isBest = !smallSampleNote && value !== null && value === best;
                  return (
                    <span
                      key={player.id}
                      className="cmp-outputs-value"
                      style={{ color: smallSampleNote || value === null ? "var(--text-muted)" : color, fontWeight: isBest ? 700 : undefined }}
                      title={player.name}
                    >
                      {row.format(value)}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
