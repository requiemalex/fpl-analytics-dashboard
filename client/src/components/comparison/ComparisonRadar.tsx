import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { fmtOrdinal } from "../../utils/format";
import { ComparisonLegend, type LegendEntry } from "./ComparisonLegend";
import { seriesKey } from "./seriesColors";

export interface RadarAxisValues {
  key: string;
  label: string;
  format: (v: number | null) => string;
  /** Per player id: his percentile within his position (flipped for a lower-is-better metric — outward is always better) and his raw figure. */
  values: Map<number, { percentile: number | null; raw: number | null }>;
}

function RadarTooltip({ active, payload, axes, entries }: { active?: boolean; payload?: { payload: { axisKey: string } }[]; axes: RadarAxisValues[]; entries: LegendEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const axis = axes.find((a) => a.key === payload[0].payload.axisKey);
  if (!axis) return null;
  return (
    <div className="chart-tooltip">
      <strong>{axis.label}</strong>
      {entries.map(({ player, color, smallSampleNote }) => {
        const v = axis.values.get(player.id);
        const pct = smallSampleNote ? "Small sample" : v?.percentile != null ? `${fmtOrdinal(v.percentile)} pct` : "No data";
        return (
          <div key={player.id} className="chart-tooltip-row">
            <span className="cmp-legend-swatch" style={{ background: color }} />
            <span>{player.name}</span>
            <span className="mono">
              {pct} · {axis.format(v?.raw ?? null)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Every compared player's shape on one radar: each axis is his percentile
 * within his own position, among everyone at or above the fixed floor for
 * the card's Data View. A player under the floor has no percentiles, so he
 * isn't drawn (the legend marks him a small sample). A missing figure plots
 * at the centre, as on the profile's radars, and the hover box says "No
 * data".
 */
export function ComparisonRadar({ axes, entries }: { axes: RadarAxisValues[]; entries: LegendEntry[] }) {
  const drawn = entries.filter((e) => !e.smallSampleNote && !e.absent);
  const data = axes.map((axis) => {
    const row: Record<string, string | number> = { axisKey: axis.key, label: axis.label };
    for (const { player } of drawn) row[seriesKey(player.id)] = axis.values.get(player.id)?.percentile ?? 0;
    return row;
  });
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {drawn.map(({ player, color }) => (
            <Radar
              key={player.id}
              name={player.name}
              dataKey={seriesKey(player.id)}
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.1}
              dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
          <Tooltip content={<RadarTooltip axes={axes} entries={entries} />} />
        </RadarChart>
      </ResponsiveContainer>
      <ComparisonLegend entries={entries} />
    </>
  );
}
