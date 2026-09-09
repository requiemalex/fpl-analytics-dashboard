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

/** Ranked bar chart of the top 15 players by a single metric — the "type" alternative to a scatter plot when a user just wants a leaderboard, not a relationship between two metrics. */
export function BarTopN({
  data,
  valueLabel,
  format,
  onBarClick,
  height = 420,
}: {
  data: BarDatum[];
  valueLabel: string;
  format?: (v: number) => string;
  onBarClick?: (id: number) => void;
  height?: number;
}) {
  const top = data
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  if (top.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "40px 20px" }}>
        <p>No eligible players have data for this chart with the current filters.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 10, right: 24, bottom: 10, left: 12 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={format} />
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
