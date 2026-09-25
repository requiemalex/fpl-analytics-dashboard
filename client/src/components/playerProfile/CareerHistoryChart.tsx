import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { fmtDecimal } from "../../utils/format";

/**
 * Deliberately narrower than PlayerSeasonHistory — this chart only ever
 * reads seasonName/totalPoints, so it works equally for a single player's
 * real season history and for a club's season totals (Team Profile's FPL
 * Points History, metrics/teamStats.ts clubSeasonHistory), without either
 * caller needing to pad out fields it doesn't have.
 */
export interface SeasonPointsEntry {
  seasonName: string;
  totalPoints: number;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const s = payload[0].payload as SeasonPointsEntry & { isLive: boolean; counted: boolean | null };
  return (
    <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
      <strong>
        {s.seasonName}
        {s.isLive ? " (live)" : s.counted === false && " †"}
      </strong>
      <div className="mono">{fmtDecimal(s.totalPoints, 0)} pts</div>
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
 * one case genuinely excluded from the average (in the player profile, so
 * is a window season with 0 minutes — <fixed_minutes_floor>). Hovering an
 * uncounted season marks it "†", the same mark Career History's table uses
 * for it. The live/in-progress season draws dashed-outline only — real, but
 * not complete yet, so not counted until it is.
 *
 * `countedSeasonNames` null means the averaging window isn't known (the
 * historic dataset failed to load): every completed season draws the same
 * neutral colour, with nothing marked counted or uncounted.
 */
export function CareerHistoryChart({
  seasons,
  countedSeasonNames,
  currentSeasonName,
  averagePoints,
}: {
  seasons: SeasonPointsEntry[];
  countedSeasonNames: Set<string> | null;
  currentSeasonName: string | null;
  averagePoints: number | null;
}) {
  const data = seasons.map((s) => ({
    ...s,
    isLive: s.seasonName === currentSeasonName,
    counted: countedSeasonNames === null ? null : countedSeasonNames.has(s.seasonName),
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
              fill={d.isLive ? "transparent" : d.counted === null ? "var(--text-secondary)" : d.counted ? "var(--accent-positive)" : "var(--text-muted)"}
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
