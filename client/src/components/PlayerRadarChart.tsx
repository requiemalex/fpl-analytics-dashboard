import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import type { RadarDataPoint } from "../metrics/radarStats";
import { fmtDecimal } from "../utils/format";

function RadarTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as RadarDataPoint;
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
      <strong>{point.label}</strong>
      <div className="mono">
        {point.percentile !== null ? `${point.percentile.toFixed(0)}th percentile` : "No data"}
        {point.rawValue !== null && ` · ${fmtDecimal(point.rawValue, 2)}`}
      </div>
    </div>
  );
}

/**
 * A null percentile plots as 0 (the chart's own inner edge) rather than
 * being skipped — recharts' RadarChart needs one value per axis to draw
 * a closed shape, and 0 reads correctly here since "no data" and "worst
 * possible" land in the same visual place anyway for a stat that isn't
 * being tracked for this player. The tooltip still says "No data"
 * explicitly rather than implying an actual bottom-percentile value.
 */
export function PlayerRadarChart({ data }: { data: RadarDataPoint[] }) {
  const chartData = data.map((d) => ({ ...d, percentileValue: d.percentile ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData} outerRadius="72%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar name="Percentile" dataKey="percentileValue" stroke="var(--accent-positive)" fill="var(--accent-positive)" fillOpacity={0.32} />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
