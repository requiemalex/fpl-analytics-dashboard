import React from "react";

/**
 * <stat_hover> in a chart's hover box: what each figure plotted is (`definitions`, one per axis or
 * series), then this entry's rank on each (`ranks`: "xG: 92nd percentile of midfielders: top 8%").
 * The same two things every figure's hover says elsewhere, in the box the chart already shows.
 */
export function ChartStatLines({ definitions, ranks }: { definitions?: string[]; ranks?: string[] }) {
  if (!definitions?.length && !ranks?.length) return null;
  return (
    <div className="chart-tooltip-stat">
      {definitions?.map((d) => (
        <div key={d} className="chart-tooltip-definition">
          {d}
        </div>
      ))}
      {ranks?.map((r) => (
        <div key={r}>{r}</div>
      ))}
    </div>
  );
}
