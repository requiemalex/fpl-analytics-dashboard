import React from "react";
import { noRowsMessage } from "../emptyMessages";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { MinutesFloorIcon } from "../MinutesFloorBadge";

export interface BarDatum {
  id: number;
  label: string;
  value: number;
  /** Set for an entry under a minutes threshold: the amber stopwatch by its name, and this in its hover box (<minutes_marker>). */
  smallSample?: string;
}

/** Size of the small-sample stopwatch beside a name. */
const MARK_PX = 11;
/** The name axis's width; a stopwatch sits at its left edge, so the marks line up in a column. */
const NAME_AXIS_PX = 130;

/** A bar's name on the axis, with the amber stopwatch before it for a small sample (<minutes_marker>). */
function NameTick({ x, y, index, rows }: { x?: number; y?: number; index?: number; rows: BarDatum[] }) {
  const row = index != null ? rows[index] : undefined;
  if (x == null || y == null || !row) return <g />;
  return (
    <g>
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
        {row.label}
      </text>
      {row.smallSample && (
        <g className="small-sample-mark" transform={`translate(${x - NAME_AXIS_PX + 4},${y - MARK_PX / 2})`}>
          <title>{row.smallSample}</title>
          <MinutesFloorIcon size={MARK_PX} />
        </g>
      )}
    </g>
  );
}

const TOP_N = 15;

function CustomTooltip({ active, payload, valueLabel, format }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as BarDatum;
  return (
    <div
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
      }}
    >
      <strong>{d.label}</strong>
      <div className="mono">
        {valueLabel}: {format ? format(d.value) : d.value.toFixed(2)}
      </div>
      {d.smallSample && <div className="chart-tooltip-small-sample">{d.smallSample}</div>}
    </div>
  );
}

/** The 15 bars shown: highest first, or lowest first when `ascending` (League Position, Goals Against, xGC…). */
export function rankBars(data: BarDatum[], ascending = false): BarDatum[] {
  return data
    .slice()
    .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))
    .slice(0, TOP_N);
}

/** Ranked bar chart of the top 15 players/teams by a single metric — the "type" alternative to a scatter plot when a user just wants a leaderboard, not a relationship between two metrics. */
export function BarTopN({
  data,
  valueLabel,
  format,
  onBarClick,
  height = 420,
  emptyMessage = noRowsMessage("player"),
  ascending = false,
}: {
  data: BarDatum[];
  valueLabel: string;
  format?: (v: number) => string;
  onBarClick?: (id: number) => void;
  height?: number;
  /** Shown in place of the chart when `data` is empty — defaults to the player-scoped wording every existing caller wants; Dashboard's team graphs pass their own. */
  emptyMessage?: string;
  /** Rank lowest first — the graph's Order, e.g. League Position 1, 2, 3… */
  ascending?: boolean;
}) {
  const top = rankBars(data, ascending);
  // Whole-number data (goals, clean sheets, draws…) gets whole-number ticks —
  // Recharts would otherwise pick 0.75-steps that a 0-decimal formatter
  // renders as "0, 1, 2, 2, 3".
  const integerValues = top.every((d) => Number.isInteger(d.value));

  if (top.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "40px 20px" }}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 10, right: 24, bottom: 10, left: 12 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={!integerValues} stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={format} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="var(--text-muted)"
          width={NAME_AXIS_PX}
          interval={0}
          tick={<NameTick rows={top} />}
        />
        <Tooltip content={<CustomTooltip valueLabel={valueLabel} format={format} />} cursor={{ fill: "var(--surface-hover)" }} />
        <Bar dataKey="value" onClick={(point: any) => onBarClick?.(point.id)} cursor={onBarClick ? "pointer" : "default"}>
          {top.map((d) => (
            <Cell key={d.id} fill="var(--accent-focus)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
