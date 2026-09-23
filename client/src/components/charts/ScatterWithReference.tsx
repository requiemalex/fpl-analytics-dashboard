import React, { useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Line, ZAxis, Cell, Label } from "recharts";
import { chooseAxisScale, scalesMismatched, type AxisScale } from "./axisScaling";

export interface ScatterPoint {
  id: number;
  label: string;
  x: number;
  y: number;
  /** Optional third dimension, rendered as bubble size (default) or as a per-point colour when `colorScale` is set. Existing charts that omit this keep the current fixed-size, single-colour dots. */
  z?: number;
}

export interface ColorScaleConfig {
  /** RGB for the low end of the z-range actually present in the data. */
  lowColor: [number, number, number];
  /** RGB for the high end of the z-range actually present in the data. */
  highColor: [number, number, number];
  lowLabel: string;
  highLabel: string;
}

function interpolateColor(t: number, low: [number, number, number], high: [number, number, number]): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(low[0] + (high[0] - low[0]) * clamped);
  const g = Math.round(low[1] + (high[1] - low[1]) * clamped);
  const b = Math.round(low[2] + (high[2] - low[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

const SCALE_SUFFIX: Record<AxisScale["kind"], string> = { linear: "", log: " (log scale)", sqrt: " (√ scale)" };

/** Recharts props for a log/√ axis — explicit domain and ticks, since Recharts' own "nice" ticks assume a linear axis. */
function transformedAxisProps(scale: AxisScale) {
  return scale.kind === "linear" ? null : { scale: scale.kind, domain: scale.domain, ticks: scale.ticks };
}

function CustomTooltip({ active, payload, zLabel }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as ScatterPoint;
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
      <strong>{p.label}</strong>
      <div className="mono">
        x: {p.x.toFixed(2)} · y: {p.y.toFixed(2)}
        {p.z !== undefined && zLabel ? ` · ${zLabel}: ${p.z.toFixed(2)}` : ""}
      </div>
    </div>
  );
}

export function ScatterWithReference({
  data,
  xLabel,
  yLabel,
  zLabel,
  colorScale,
  showReferenceLine,
  onPointClick,
  height = 360,
  xTickStep,
  xTickFormatter,
  emptyMessage = "No eligible players have data for this chart with the current filters.",
}: {
  data: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  /** Label for the optional z dimension, shown in the tooltip. Only meaningful when at least one point sets `z`. */
  zLabel?: string;
  /** When set, `z` drives each point's fill colour (low→high gradient across the z-range actually present in `data`) instead of bubble size. */
  colorScale?: ColorScaleConfig;
  showReferenceLine?: boolean;
  onPointClick?: (id: number) => void;
  height?: number;
  /** When set, the x-axis gets explicit ticks (and matching gridlines) at this interval, spanning the data's own min/max, instead of Recharts' auto-picked ticks — e.g. 0.5 for clear £0.5m price markers. */
  xTickStep?: number;
  /** How to render each x-axis tick's label — e.g. (v) => v.toFixed(1). Only used together with xTickStep. */
  xTickFormatter?: (v: number) => string;
  /** Shown in place of the chart when `data` is empty — defaults to the player-scoped wording every existing caller wants; Dashboard's team graphs pass their own. */
  emptyMessage?: string;
}) {
  const hasZ = useMemo(() => data.some((d) => d.z !== undefined && d.z !== null), [data]);
  const useBubbleSize = hasZ && !colorScale;

  const xTicks = useMemo(() => {
    if (!xTickStep || data.length === 0) return undefined;
    const xs = data.map((d) => d.x);
    const min = Math.floor(Math.min(...xs) / xTickStep) * xTickStep;
    const max = Math.ceil(Math.max(...xs) / xTickStep) * xTickStep;
    const ticks: number[] = [];
    for (let v = min; v <= max + xTickStep / 2; v += xTickStep) ticks.push(Math.round(v * 1000) / 1000);
    return ticks;
  }, [data, xTickStep]);

  // Colour domain is the min/max of z actually present in the current
  // (filtered) data, not a fixed absolute scale — consistent with how
  // percentile bands and other relative measures already work in this
  // app, and it means the gradient stays meaningful as filters narrow
  // the population.
  const zRange = useMemo(() => {
    if (!colorScale) return null;
    const values = data.map((d) => d.z).filter((v): v is number => v !== undefined && v !== null);
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [data, colorScale]);

  // <axis_scaling> (axisScaling.ts): the reference line only when both
  // axes are on comparable scales; log/√ axes only when no line is drawn
  // (y = x is a straight 45° line on matching linear axes only).
  const { lineSuppressed, drawReferenceLine, xScale, yScale } = useMemo(() => {
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const suppressed = !!showReferenceLine && scalesMismatched(xs, ys);
    const draw = !!showReferenceLine && !suppressed;
    const linear: AxisScale = { kind: "linear" };
    return {
      lineSuppressed: suppressed,
      drawReferenceLine: draw,
      xScale: draw || xTickStep ? linear : chooseAxisScale(xs),
      yScale: draw ? linear : chooseAxisScale(ys),
    };
  }, [data, showReferenceLine, xTickStep]);

  const referenceLineData = useMemo(() => {
    if (!drawReferenceLine || data.length === 0) return [];
    const max = Math.max(...data.map((d) => Math.max(d.x, d.y)), 1);
    return [
      { x: 0, y: 0 },
      { x: max, y: max },
    ];
  }, [data, drawReferenceLine]);

  // Recharts' default number-axis domain is [0, auto] — fine with the 45°
  // reference line (which needs both axes anchored at 0 to mean anything),
  // but wasteful otherwise: e.g. every price is >= £3.9m, so a 0-based
  // price axis spends a quarter of the chart on empty space. Without the
  // line, both axes fit the data's own range, still rounded to nice ticks.
  const fitDomain = drawReferenceLine ? undefined : (["auto", "auto"] as [string, string]);
  const xTransformed = transformedAxisProps(xScale);
  const yTransformed = transformedAxisProps(yScale);
  const scaledAxes = [xScale.kind !== "linear" ? xLabel : null, yScale.kind !== "linear" ? yLabel : null].filter((l): l is string => l !== null);

  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "40px 20px" }}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 10, right: 20, bottom: 26, left: 16 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            {...(xTicks ? { ticks: xTicks, domain: [xTicks[0], xTicks[xTicks.length - 1]] } : xTransformed ?? (fitDomain ? { domain: fitDomain } : {}))}
            tickFormatter={xTickFormatter}
          >
            <Label value={xLabel + SCALE_SUFFIX[xScale.kind]} position="bottom" offset={0} style={{ fill: "var(--text-muted)", fontSize: 11 }} />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            {...(yTransformed ?? { domain: fitDomain })}
          >
            <Label value={yLabel + SCALE_SUFFIX[yScale.kind]} angle={-90} position="left" style={{ fill: "var(--text-muted)", fontSize: 11, textAnchor: "middle" }} />
          </YAxis>
          {/* Fixed-size dots are kept small and semi-transparent so a dense cluster (many players on the same whole-number goals/price value) reads as a darker patch rather than one solid blob. */}
          <ZAxis dataKey={useBubbleSize ? "z" : undefined} range={useBubbleSize ? [30, 160] : [22, 22]} name={zLabel} />
          <Tooltip content={<CustomTooltip zLabel={zLabel} />} cursor={{ stroke: "var(--border-strong)" }} />
          {drawReferenceLine && (
            <Line data={referenceLineData} dataKey="y" stroke="var(--text-muted)" strokeDasharray="4 4" dot={false} legendType="none" isAnimationActive={false} />
          )}
          <Scatter data={data} fillOpacity={useBubbleSize ? 0.8 : 0.55} onClick={(point: any) => onPointClick?.(point.id)} cursor={onPointClick ? "pointer" : "default"}>
            {data.map((d) => {
              let fill = "var(--accent-positive)";
              if (colorScale && zRange && d.z !== undefined && d.z !== null) {
                const t = zRange.max > zRange.min ? (d.z - zRange.min) / (zRange.max - zRange.min) : 0.5;
                fill = interpolateColor(t, colorScale.lowColor, colorScale.highColor);
              }
              return <Cell key={d.id} fill={fill} />;
            })}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
      {(lineSuppressed || scaledAxes.length > 0) && (
        <p style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "center", margin: "2px 0 0" }}>
          {lineSuppressed && `Reference line hidden: ${xLabel} and ${yLabel} are on different scales. `}
          {scaledAxes.length > 0 &&
            `${scaledAxes.join(" and ")} ${scaledAxes.length > 1 ? "axes are" : "axis is"} stretched so a crowded range spreads out; hover a point for its real values.`}
        </p>
      )}
      {colorScale && zRange && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{colorScale.lowLabel}</span>
          <div
            style={{
              width: 120,
              height: 8,
              borderRadius: 4,
              background: `linear-gradient(to right, ${interpolateColor(0, colorScale.lowColor, colorScale.highColor)}, ${interpolateColor(0.5, colorScale.lowColor, colorScale.highColor)}, ${interpolateColor(1, colorScale.lowColor, colorScale.highColor)})`,
            }}
          />
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{colorScale.highLabel}</span>
        </div>
      )}
    </div>
  );
}
