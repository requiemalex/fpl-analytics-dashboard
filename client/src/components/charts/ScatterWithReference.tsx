import React, { useMemo } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ZAxis, Cell, Label } from "recharts";
import { planScatterAxes, type AxisScale } from "./axisScaling";

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

/** Recharts props for a planned axis — explicit scale, domain and ticks (Recharts' own "nice" ticks assume a linear, 0-based axis). */
function axisProps(scale: AxisScale) {
  return { scale: scale.kind, domain: scale.domain, ticks: scale.ticks };
}

/**
 * The hovered point's own values, labelled with its metrics. A ScatterChart's
 * tooltip is item-triggered — it follows the point under the cursor. (This
 * used to be a ComposedChart, whose axis-triggered tooltip never fired over a
 * plain scatter and, with the reference line drawn, named whichever player
 * matched the cursor's x-position rather than the hovered one.)
 */
function CustomTooltip({ active, payload, xLabel, yLabel, zLabel, xFormat, yFormat }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as ScatterPoint;
  const fx = (v: number) => (xFormat ? xFormat(v) : v.toFixed(2));
  const fy = (v: number) => (yFormat ? yFormat(v) : v.toFixed(2));
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
        {xLabel}: {fx(p.x)} · {yLabel}: {fy(p.y)}
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
  xFormat,
  yFormat,
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
  /** How the tooltip shows each axis's value (e.g. £15.6m, 45.2%) — two decimals when omitted. */
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
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

  // <axis_scaling> (axisScaling.ts): every axis fits its data with a small
  // margin, a crowded long-tailed axis is stretched (log/√), and the
  // reference line is drawn only when x and y are on comparable scales —
  // then both axes share one planned axis, so y = x stays the diagonal.
  const plan = useMemo(
    () =>
      planScatterAxes(
        data.map((d) => d.x),
        data.map((d) => d.y),
        !!showReferenceLine,
      ),
    [data, showReferenceLine],
  );

  // y = x across the shared axis: a straight diagonal whatever the scale,
  // since both axes share one planned range and stretch.
  const referenceSegment = useMemo(() => {
    if (!plan.drawReferenceLine) return null;
    const [lo, hi] = plan.x.domain;
    return [
      { x: lo, y: lo },
      { x: hi, y: hi },
    ];
  }, [plan]);

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
        <ScatterChart margin={{ top: 10, right: 20, bottom: 26, left: 16 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            {...(xTicks && !plan.drawReferenceLine ? { ticks: xTicks, domain: [xTicks[0], xTicks[xTicks.length - 1]] } : axisProps(plan.x))}
            tickFormatter={xTickFormatter}
          >
            <Label value={xLabel + SCALE_SUFFIX[xTicks && !plan.drawReferenceLine ? "linear" : plan.x.kind]} position="bottom" offset={0} style={{ fill: "var(--text-muted)", fontSize: 11 }} />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            {...axisProps(plan.y)}
          >
            <Label value={yLabel + SCALE_SUFFIX[plan.y.kind]} angle={-90} position="left" style={{ fill: "var(--text-muted)", fontSize: 11, textAnchor: "middle" }} />
          </YAxis>
          {/* Fixed-size dots are kept small and semi-transparent so a dense cluster (many players on the same whole-number goals/price value) reads as a darker patch rather than one solid blob. */}
          <ZAxis dataKey={useBubbleSize ? "z" : undefined} range={useBubbleSize ? [30, 160] : [22, 22]} name={zLabel} />
          <Tooltip
            content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} zLabel={zLabel} xFormat={xFormat} yFormat={yFormat} />}
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
          />
          {referenceSegment && <ReferenceLine segment={referenceSegment} stroke="var(--text-muted)" strokeDasharray="4 4" ifOverflow="hidden" />}
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
        </ScatterChart>
      </ResponsiveContainer>
      {plan.lineSuppressed && (
        <p style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "center", margin: "2px 0 0" }}>
          Reference line hidden: {xLabel} and {yLabel} are on different scales.
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
