import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { PlayerSeasonHistory } from "../../types/normalized";
import { fmtDecimal } from "../../utils/format";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const s = payload[0].payload as PlayerSeasonHistory & { isLive: boolean; counted: boolean };
  return (
    <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
      <strong>
        {s.seasonName}
        {s.isLive ? " (live)" : !s.counted && " *"}
      </strong>
      <div className="mono">{fmtDecimal(s.totalPoints)} pts</div>
    </div>
  );
}

/**
 * Colour tracks whether a season is actually counted in the average shown
 * on this chart, not minutes played: every season inside the rolling
 * window counts (<no_survivorship_bias>, historicAnalysis.ts — a light,
 * injury-hit season pulls the average down rather than being dropped from
 * it), so it draws green/solid same as any other in-window season. Only a
 * season outside the window (too old) draws muted-grey, since that's the
 * one case genuinely excluded from the average. The live/in-progress
 * season draws dashed-outline only — real, but not complete yet, so not
 * counted until it is.
 */
export function CareerHistoryChart({
  seasons,
  countedSeasonNames,
  currentSeasonName,
  averagePoints,
}: {
  seasons: PlayerSeasonHistory[];
  countedSeasonNames: Set<string>;
  currentSeasonName: string | null;
  averagePoints: number | null;
}) {
  const data = seasons.map((s) => ({
    ...s,
    isLive: s.seasonName === currentSeasonName,
    counted: countedSeasonNames.has(s.seasonName),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="seasonName" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-hover)" }} />
        {averagePoints !== null && (
          <ReferenceLine
            y={averagePoints}
            stroke="var(--accent-value)"
            strokeDasharray="4 4"
            label={{ value: `Avg ${fmtDecimal(averagePoints, 0)}`, position: "insideTopRight", fill: "var(--accent-value)", fontSize: 11 }}
          />
        )}
        <Bar dataKey="totalPoints" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {data.map((d) => (
            <Cell
              key={d.seasonName}
              fill={d.isLive ? "transparent" : d.counted ? "var(--accent-positive)" : "var(--text-muted)"}
              stroke={d.isLive ? "var(--accent-positive)" : "none"}
              strokeDasharray={d.isLive ? "4 3" : undefined}
              strokeWidth={d.isLive ? 1.5 : 0}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
