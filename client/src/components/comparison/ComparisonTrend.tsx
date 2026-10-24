import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { seasonAxisTicks, trendAwayKey, trendBelowKey, trendBridgeKey, trendDataKey, trendUnplayedKey, type SeasonTrendRow, type TrendDisplay } from "../../metrics/careerTrends";
import { shortSeason } from "../../utils/season";
import { fmtDecimal, fmtPrice } from "../../utils/format";
import { ComparisonLegend, type LegendEntry } from "./ComparisonLegend";
import { SmallSampleMark } from "../MinutesFloorBadge";

export function formatTrendValue(metric: TrendDisplay, v: number | null): string {
  return metric.price ? fmtPrice(v) : fmtDecimal(v, metric.decimals);
}

function TrendTooltip({
  active,
  label,
  metric,
  sourceClass,
  entries,
  rows,
  minMinutes,
}: {
  active?: boolean;
  label?: string;
  metric: TrendDisplay;
  sourceClass?: string;
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
        {label} · <span className={sourceClass ? `source-coloured ${sourceClass}` : undefined}>{metric.label}</span>
      </strong>
      {entries.map(({ player, color }) => {
        const v = row[trendDataKey(player.id)];
        const below = row[trendBelowKey(player.id)];
        if (row[trendAwayKey(player.id)] === true)
          return (
            <div key={player.id} className="chart-tooltip-row">
              <span className="cmp-legend-swatch" style={{ background: color }} />
              <span>{player.name}</span>
              <span className="cmp-trend-away">Not in FPL this season</span>
            </div>
          );
        if (row[trendUnplayedKey(player.id)] === true)
          return (
            <div key={player.id} className="chart-tooltip-row">
              <span className="cmp-legend-swatch" style={{ background: color }} />
              <span>{player.name}</span>
              <span className="cmp-trend-away">Didn't play this season</span>
            </div>
          );
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

/** Size of the small-sample marker drawn in place of a dot. */
const BELOW_MARK_PX = 14;

/** A season's point: a dot in the player's colour, or — for a season under the card's minimum — the amber small-sample stopwatch, the one marker the app uses for a small sample (<minutes_marker>). */
function trendDot(playerId: number, color: string) {
  return function TrendDot(props: { cx?: number; cy?: number; payload?: SeasonTrendRow; index?: number }) {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null || !payload) return <g key={index} />;
    const below = typeof payload[trendBelowKey(playerId)] === "number";
    return below ? (
      <SmallSampleMark key={index} cx={cx} cy={cy} size={BELOW_MARK_PX} />
    ) : (
      <circle key={index} cx={cx} cy={cy} r={3} fill={color} />
    );
  };
}

/**
 * One metric season by season: completed seasons along the bottom, the
 * metric (named on the y axis) up the side, one line per player in his
 * colour. A season with no figure is a gap in his line, not a zero. A
 * spell out of FPL between two of his seasons is a dotted line in his
 * colour, and the hover box says he wasn't in FPL, so a return isn't read
 * as a missing figure; a season of 0 minutes likewise, the hover box
 * saying he didn't play (<no_minutes_no_figures>: never a 0 on the line). A
 * season under the card's minimum minutes still shows his real figure, but
 * its point is the amber small-sample stopwatch and the hover box adds his minutes, so a
 * small-sample season is never mistaken for a full one.
 */
/** `sourceClass`: a second source's figure, its name on the axis and in the hover box in that source's colour (the colour index). */
export function ComparisonTrend({
  metric,
  sourceClass,
  rows,
  entries,
  minMinutes,
}: {
  metric: TrendDisplay;
  sourceClass?: string;
  rows: SeasonTrendRow[];
  entries: LegendEntry[];
  minMinutes: number;
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="seasonName"
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            tickLine={false}
            ticks={seasonAxisTicks(rows.map((r) => r.seasonName))}
            interval={0}
            tickFormatter={shortSeason}
            padding={{ left: 16, right: 16 }}
          />
          <YAxis
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            tickLine={false}
            width={56}
            allowDecimals={metric.decimals > 0}
            tickFormatter={(v: number) => formatTrendValue(metric, v)}
            label={{
              value: metric.label,
              angle: -90,
              position: "insideLeft",
              offset: 0,
              fontSize: 11,
              style: { textAnchor: "middle" },
              ...(sourceClass ? { className: `source-coloured ${sourceClass}` } : { fill: "var(--text-muted)" }),
            }}
          />
          <Tooltip content={<TrendTooltip metric={metric} sourceClass={sourceClass} entries={entries} rows={rows} minMinutes={minMinutes} />} cursor={{ stroke: "var(--border-strong)" }} />
          {entries.map(({ player, color }) => (
            <Line
              key={`bridge-${player.id}`}
              type="linear"
              dataKey={trendBridgeKey(player.id)}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="1 5"
              strokeLinecap="round"
              dot={false}
              activeDot={false}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
          ))}
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
