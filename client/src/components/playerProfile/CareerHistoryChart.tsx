import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { PlayerSeasonHistory } from "../../types/normalized";
import { fmtDecimal } from "../../utils/format";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const s = payload[0].payload as PlayerSeasonHistory & { isLive: boolean; qualifies: boolean };
  return (
    <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
      <strong>
        {s.seasonName}
        {s.isLive ? " (live)" : !s.qualifies && " *"}
      </strong>
      <div className="mono">{fmtDecimal(s.totalPoints)} pts</div>
      {s.isLive && <div style={{ color: "var(--text-muted)", marginTop: 2 }}>In progress — not yet counted in the average</div>}
      {!s.isLive && !s.qualifies && (
        <div style={{ color: "var(--text-muted)", marginTop: 2 }}>Light season (fewer minutes than usual) — still counted in the average</div>
      )}
    </div>
  );
}

/**
 * A qualifying season (enough minutes, within the rolling window) draws
 * as a solid bar; the live/in-progress season draws dashed-outline only
 * (it's real but not comparable to a full season yet, and isn't counted
 * in the average until it's complete); any other completed-but-light
 * season (an injury-hit year) draws muted-solid — still counted in the
 * average (see <no_survivorship_bias>, historicAnalysis.ts), just
 * visually flagged so a dip in the average line is legible rather than
 * mysterious. Same distinction the existing Career History table
 * already uses via row colour/asterisk, just carried over into the chart.
 */
export function CareerHistoryChart({
  seasons,
  qualifyingSeasonNames,
  currentSeasonName,
  averagePoints,
}: {
  seasons: PlayerSeasonHistory[];
  qualifyingSeasonNames: Set<string>;
  currentSeasonName: string | null;
  averagePoints: number | null;
}) {
  const data = seasons.map((s) => ({
    ...s,
    isLive: s.seasonName === currentSeasonName,
    qualifies: qualifyingSeasonNames.has(s.seasonName),
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
              fill={d.isLive ? "transparent" : d.qualifies ? "var(--accent-positive)" : "var(--text-muted)"}
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
