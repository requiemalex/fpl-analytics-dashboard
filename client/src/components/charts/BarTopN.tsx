import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

export interface BarDatum {
  id: number;
  label: string;
  value: number;
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
  emptyMessage = "No eligible players have data for this chart with the current filters.",
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
          width={130}
          tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
        />
        <Tooltip content={<CustomTooltip valueLabel={valueLabel} format={format} />} cursor={{ fill: "var(--surface-hover)" }} />
        <Bar dataKey="value" onClick={(point: any) => onBarClick?.(point.id)} cursor={onBarClick ? "pointer" : "default"}>
          {top.map((d) => (
            <Cell key={d.id} fill="var(--accent-positive)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
