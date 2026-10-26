import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { seasonAxisTicks, trendAwayKey, trendBelowKey, trendBridgeKey, trendDataKey, trendUnplayedKey, type SeasonTrendRow, type TrendDisplay } from "../../metrics/careerTrends";
import { shortSeason } from "../../utils/season";
import { fmtDecimal, fmtPrice } from "../../utils/format";
import { ComparisonLegend, type LegendEntry } from "./ComparisonLegend";
import { SmallSampleMark } from "../MinutesFloorBadge";
import { ChartStatLines } from "../charts/ChartStatLines";

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
  hint,
  rankText,
}: {
  active?: boolean;
  label?: string;
  metric: TrendDisplay;
  sourceClass?: string;
  entries: LegendEntry[];
  rows: SeasonTrendRow[];
  minMinutes: number;
  hint?: string;
  rankText?: (playerId: number, seasonName: string) => string | undefined;
}) {
  if (!active || !label) return null;
  const row = rows.find((r) => r.seasonName === label);
  if (!row) return null;
  return (
    <div className="chart-tooltip">
      <strong>
        {label} · <span className={sourceClass ? `source-coloured ${sourceClass}` : undefined}>{metric.label}</span>
      </strong>
      <ChartStatLines definitions={hint ? [hint] : undefined} />
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
              <span className="cmp-trend-away cmp-trend-below">Didn't play this season · 0 min, under {minMinutes.toLocaleString("en-GB")}</span>
            </div>
          );
        return (
          <div key={player.id} className="chart-tooltip-row">
            <span className="cmp-legend-swatch" style={{ background: color }} />
            <span>{player.name}</span>
            <span className={`mono${typeof below === "number" ? " cmp-trend-below" : ""}`}>
              {formatTrendValue(metric, typeof v === "number" ? v : null)}
              {typeof below === "number" && ` · ${below.toLocaleString("en-GB")} min, under ${minMinutes.toLocaleString("en-GB")}`}
              {typeof v === "number" && rankText?.(player.id, label) && ` · ${rankText(player.id, label)}`}
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
 * A season he didn't play: under any minimum (<no_data_is_zero>), so it
 * carries the amber stopwatch too, but it has no figure. The stopwatch sits
 * on his dotted line where one bridges the season, otherwise on the chart's
 * floor — never as a 0 on his line.
 */
function unplayedMark(props: { cx?: number; cy?: number; index?: number }) {
  const { cx, cy, index } = props;
  if (cx == null || cy == null) return <g key={index} />;
  return <SmallSampleMark key={index} cx={cx} cy={cy} size={BELOW_MARK_PX} />;
}

/**
 * One metric season by season: completed seasons along the bottom, the
 * metric (named on the y axis) up the side, one line per player in his
 * colour. A season with no figure is a gap in his line, not a zero. A
 * spell out of FPL between two of his seasons is a dotted line in his
 * colour, and the hover box says he wasn't in FPL, so a return isn't read
 * as a missing figure; a season of 0 minutes likewise, the hover box
 * saying he didn't play (<no_minutes_no_figures>: never a 0 on the line),
 * with the amber stopwatch (unplayedMark). A
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
  hint,
  rankText,
}: {
  metric: TrendDisplay;
  sourceClass?: string;
  rows: SeasonTrendRow[];
  entries: LegendEntry[];
  minMinutes: number;
  /** What the figure is, and a season's figure ranked in words, for the hover box (<stat_hover>). */
  hint?: string;
  rankText?: (playerId: number, seasonName: string) => string | undefined;
}) {
  // The chart's floor, for a 0-minute season's stopwatch with no dotted line to sit on.
  const floor = Math.min(0, ...rows.flatMap((r) => entries.map((e) => r[trendDataKey(e.player.id)]).filter((v): v is number => typeof v === "number")));
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
          <Tooltip content={<TrendTooltip metric={metric} sourceClass={sourceClass} entries={entries} rows={rows} minMinutes={minMinutes} hint={hint} rankText={rankText} />} cursor={{ stroke: "var(--border-strong)" }} />
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
          {entries.map(({ player }) => (
            <Line
              key={`unplayed-${player.id}`}
              type="linear"
              dataKey={(r: SeasonTrendRow) => {
                if (r[trendUnplayedKey(player.id)] !== true) return null;
                const bridge = r[trendBridgeKey(player.id)];
                return typeof bridge === "number" ? bridge : floor;
              }}
              stroke="none"
              dot={unplayedMark}
              activeDot={false}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ComparisonLegend entries={entries} />
    </>
  );
}
