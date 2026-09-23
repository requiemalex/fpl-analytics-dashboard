/**
 * <axis_scaling>: the blanket rules every scatter graph's axes follow, so a
 * graph stays readable whatever pair of metrics is picked.
 *
 * Rule 1 — different scales: when one axis's values are SCALE_MISMATCH_FACTOR
 * times bigger than the other's (Price £4–15m against Points 0–240; a club's
 * xG ~70 against its FPL points ~1,800), the two can't share a scale — the
 * 45° reference line, which puts both axes on one 0-based scale, would
 * squash the smaller metric into a sliver of the chart. The line isn't
 * drawn (the chart says why) and each axis fits its own data.
 *
 * Rule 2 — long tail: when a few big values stretch an axis so far that the
 * middle half of the points is crammed into under CROWDED_SHARE of it
 * (Price: most players £4.5–5.7m, a handful £10m+), that axis switches to a
 * log scale (or square-root, if it has zeros) — provided the switch
 * actually spreads that middle half out by MIN_SPREAD_GAIN (30%) or more.
 * Never with a reference line drawn: y = x is only a straight 45° line on
 * two matching linear axes.
 */

/** 5× ≈ 0.7 orders of magnitude: past this, a shared axis would leave the smaller metric using under a fifth of the chart. */
export const SCALE_MISMATCH_FACTOR = 5;
/** An axis is "crowded" when the middle half of its points (25th–75th percentile) spans less than this share of the axis. */
export const CROWDED_SHARE = 0.2;
/** A log/√ axis is only used if it spreads that middle half at least this much wider than linear — otherwise it's distortion for nothing. */
export const MIN_SPREAD_GAIN = 1.3;
/** Too few points to call a distribution "crowded" — a handful of hand-picked players/teams keep plain axes. */
export const MIN_POINTS_FOR_RESCALE = 8;

export type AxisScaleKind = "linear" | "log" | "sqrt";

export interface AxisScale {
  kind: AxisScaleKind;
  /** Explicit domain and ticks for a log/√ axis (Recharts' own "nice" ticks are linear); undefined for linear, which keeps Recharts' auto fit. */
  domain?: [number, number];
  ticks?: number[];
}

/** An axis's order of magnitude, as its largest absolute value. */
function magnitude(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

/** Rule 1: are these two axes too far apart in size to share a scale? */
export function scalesMismatched(xs: number[], ys: number[]): boolean {
  const mx = magnitude(xs);
  const my = magnitude(ys);
  if (mx === 0 && my === 0) return false;
  if (mx === 0 || my === 0) return true;
  return Math.max(mx, my) / Math.min(mx, my) >= SCALE_MISMATCH_FACTOR;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const TRANSFORMS: Record<Exclude<AxisScaleKind, "linear">, (v: number) => number> = { log: Math.log, sqrt: Math.sqrt };

/** Share of the axis (min→max, in the axis's own spacing) that the middle half of the points spans. */
function middleHalfShare(sorted: number[], t: (v: number) => number): number {
  const span = t(sorted[sorted.length - 1]) - t(sorted[0]);
  if (span <= 0) return 1;
  return (t(quantile(sorted, 0.75)) - t(quantile(sorted, 0.25))) / span;
}

/** A 1/2/5 × 10^k step giving roughly `count` intervals across `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/** Round-number ticks spaced evenly in the transformed axis: a fine grid of round values, thinned so neighbours sit at least 1/7 of the axis apart. */
function transformedTicks(min: number, max: number, kind: Exclude<AxisScaleKind, "linear">): { domain: [number, number]; ticks: number[] } {
  const t = TRANSFORMS[kind];
  const step = niceStep(max - min, 24);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v: number) => Number(v.toFixed(decimals));
  let lo = round(Math.floor(min / step) * step);
  if (kind === "log" && lo <= 0) lo = min;
  const hi = round(Math.ceil(max / step) * step);
  const minGap = (t(hi) - t(lo)) / 7;
  const ticks = [lo];
  for (let v = round(lo + step); v <= hi + step / 2; v = round(v + step)) {
    if (t(v) - t(ticks[ticks.length - 1]) >= minGap) ticks.push(v);
  }
  return { domain: [lo, Math.max(hi, ticks[ticks.length - 1])], ticks };
}

/** Rule 2: pick an axis's scale from its values. */
export function chooseAxisScale(values: number[]): AxisScale {
  if (values.length < MIN_POINTS_FOR_RESCALE) return { kind: "linear" };
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] < 0) return { kind: "linear" };
  const linearShare = middleHalfShare(sorted, (v) => v);
  if (linearShare >= CROWDED_SHARE) return { kind: "linear" };
  // Log can't show 0; √ can, and still pulls a long tail in.
  const kind: Exclude<AxisScaleKind, "linear"> = sorted[0] > 0 ? "log" : "sqrt";
  const share = middleHalfShare(sorted, TRANSFORMS[kind]);
  // (share 0: the middle half is one repeated value — no scale separates it.)
  if (share === 0 || share < linearShare * MIN_SPREAD_GAIN) return { kind: "linear" };
  return { kind, ...transformedTicks(sorted[0], sorted[sorted.length - 1], kind) };
}
