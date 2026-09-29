import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { trendBelowKey, trendDataKey, type SeasonTrendRow, type TrendMetric } from "../../metrics/careerTrends";
import { fmtDecimal, fmtPrice } from "../../utils/format";
import { ComparisonLegend, type LegendEntry } from "./ComparisonLegend";

export function formatTrendValue(metric: TrendMetric, v: number | null): string {
  return metric.price ? fmtPrice(v) : fmtDecimal(v, metric.decimals);
}

function TrendTooltip({
  active,
  label,
  metric,
  entries,
  rows,
  minMinutes,
}: {
  active?: boolean;
  label?: string;
  metric: TrendMetric;
  entries: LegendEntry[];
  rows: SeasonTrendRow[];
  minMinutes: number;
}) {
  if (!active || !label) return null;
  const row = rows.find((r) => r.seasonName === label);
  if (!row) return null;
  return (
    <div className="chart-tooltip">
      <strong>
        {label} · {metric.label}
      </strong>
      {entries.map(({ player, color }) => {
        const v = row[trendDataKey(player.id)];
        const below = row[trendBelowKey(player.id)];
        return (
          <div key={player.id} className="chart-tooltip-row">
            <span className="cmp-legend-swatch" style={{ background: color }} />
            <span>{player.name}</span>
            <span className={`mono${typeof below === "number" ? " cmp-trend-below" : ""}`}>
              {formatTrendValue(metric, typeof v === "number" ? v : null)}
              {typeof below === "number" && ` · ${below.toLocaleString("en-GB")} min, under ${minMinutes.toLocaleString("en-GB")}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A season's point: a dot in the player's colour, or — for a season under the card's minimum — a hollow amber ring (the small-sample colour). */
function trendDot(playerId: number, color: string) {
  return function TrendDot(props: { cx?: number; cy?: number; payload?: SeasonTrendRow; index?: number }) {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null || !payload) return <g key={index} />;
    const below = typeof payload[trendBelowKey(playerId)] === "number";
    return below ? (
      <circle key={index} className="cmp-trend-below-dot" cx={cx} cy={cy} r={4} strokeWidth={2} />
    ) : (
      <circle key={index} cx={cx} cy={cy} r={3} fill={color} />
    );
  };
}

/**
 * One metric season by season: completed seasons along the bottom, the
 * metric (named on the y axis) up the side, one line per player in his
 * colour. A season with no figure is a gap in his line, not a zero. A
 * season under the card's minimum minutes still shows his real figure, but
 * its point is an amber ring and the hover box adds his minutes, so a
 * small-sample season is never mistaken for a full one.
 */
export function ComparisonTrend({ metric, rows, entries, minMinutes }: { metric: TrendMetric; rows: SeasonTrendRow[]; entries: LegendEntry[]; minMinutes: number }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="seasonName" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickLine={false} />
          <YAxis
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            tickLine={false}
            width={56}
            allowDecimals={metric.decimals > 0}
            tickFormatter={(v: number) => formatTrendValue(metric, v)}
            label={{ value: metric.label, angle: -90, position: "insideLeft", offset: 0, fill: "var(--text-muted)", fontSize: 11, style: { textAnchor: "middle" } }}
          />
          <Tooltip content={<TrendTooltip metric={metric} entries={entries} rows={rows} minMinutes={minMinutes} />} cursor={{ stroke: "var(--border-strong)" }} />
          {entries.map(({ player, color }) => (
            <Line
              key={player.id}
              type="monotone"
              dataKey={trendDataKey(player.id)}
              name={player.name}
              stroke={color}
              strokeWidth={2}
              dot={trendDot(player.id, color)}
              activeDot={{ r: 4.5, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ComparisonLegend entries={entries} />
    </>
  );
}
