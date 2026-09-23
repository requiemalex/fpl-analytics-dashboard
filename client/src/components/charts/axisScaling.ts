/**
 * <axis_scaling>: the blanket rules every scatter graph's axes follow, so a
 * graph stays readable whatever pair of metrics is picked.
 *
 * Rule 1 — different scales: when one axis's values are SCALE_MISMATCH_FACTOR
 * times bigger than the other's (Price £4–15m against Points 0–240; a club's
 * xG ~70 against its FPL points ~1,800), the two can't share a scale — the
 * 45° reference line, which puts both axes on one scale, would squash the
 * smaller metric into a sliver of the chart. The line isn't drawn (the
 * chart says why) and each axis fits its own data.
 *
 * Rule 2 — long tail: when a few big values stretch an axis so far that the
 * middle half of the points is crammed into under CROWDED_SHARE of it
 * (Price: most players £4.5–5.7m, a handful £10m+; xG: most players 0–3, a
 * few 15+), that axis switches to a log scale (or square-root, if it has
 * zeros) — provided the switch spreads that middle half out by
 * MIN_SPREAD_GAIN (30%) or more.
 *
 * Rule 3 — fit the data: an axis runs from AXIS_PAD below its lowest value
 * to AXIS_PAD above its highest (a share of the data's range), not from 0
 * for its own sake — clubs' goals against run 27–58, so the axis does too.
 * It starts at 0 only when the lowest value is already close to it (within
 * ZERO_SNAP_SHARE of the range, or the margin), and never crosses 0 when
 * the data doesn't.
 *
 * With a reference line drawn, both axes are planned as ONE axis over the
 * x and y values together and share its range, ticks and scale: y = x then
 * stays the chart's straight diagonal, whether that scale is linear or
 * stretched.
 */

/** 5× ≈ 0.7 orders of magnitude: past this, a shared axis would leave the smaller metric using under a fifth of the chart. */
export const SCALE_MISMATCH_FACTOR = 5;
/** An axis is "crowded" when the middle half of its points (25th–75th percentile) spans less than this share of the axis. */
export const CROWDED_SHARE = 0.2;
/** A log/√ axis is only used if it spreads that middle half at least this much wider than linear — otherwise it's distortion for nothing. */
export const MIN_SPREAD_GAIN = 1.3;
/** Too few points to call a distribution "crowded" — a handful of hand-picked players/teams keep plain axes. */
export const MIN_POINTS_FOR_RESCALE = 8;
/** Breathing room each side of the data, as a share of its range — so no point sits on the chart's edge. */
export const AXIS_PAD = 0.05;
/** A lowest value this close to 0 (as a share of the data's range) starts the axis at 0 — a truer baseline than, say, 8 — rather than just below itself. */
export const ZERO_SNAP_SHARE = 0.15;

export type AxisScaleKind = "linear" | "log" | "sqrt";

export interface AxisScale {
  kind: AxisScaleKind;
  domain: [number, number];
  ticks: number[];
}

export interface ScatterAxesPlan {
  /** The reference line was asked for but left out — Rule 1. */
  lineSuppressed: boolean;
  drawReferenceLine: boolean;
  x: AxisScale;
  y: AxisScale;
}

type Transform = (v: number) => number;
const TRANSFORMS: Record<AxisScaleKind, Transform> = { linear: (v) => v, log: Math.log, sqrt: Math.sqrt };

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

/** Share of the axis (min→max, in the axis's own spacing) that the middle half of the points spans. */
function middleHalfShare(sorted: number[], t: Transform): number {
  const span = t(sorted[sorted.length - 1]) - t(sorted[0]);
  if (span <= 0) return 1;
  return (t(quantile(sorted, 0.75)) - t(quantile(sorted, 0.25))) / span;
}

/** Rule 2: which scale an axis over these values should use. */
export function chooseScaleKind(values: number[]): AxisScaleKind {
  if (values.length < MIN_POINTS_FOR_RESCALE) return "linear";
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] < 0) return "linear";
  const linearShare = middleHalfShare(sorted, TRANSFORMS.linear);
  if (linearShare >= CROWDED_SHARE) return "linear";
  // Log can't show 0; √ can, and still pulls a long tail in.
  const kind = sorted[0] > 0 ? "log" : "sqrt";
  const share = middleHalfShare(sorted, TRANSFORMS[kind]);
  // (share 0: the middle half is one repeated value — no scale separates it.)
  return share === 0 || share < linearShare * MIN_SPREAD_GAIN ? "linear" : kind;
}

/** Decimal places a round step needs (0.25 → 2, 2.5 → 1, 10 → 0). */
function decimalsOf(step: number): number {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

const roundTo = (v: number, decimals: number) => Number(v.toFixed(decimals));

/** The round step (1, 2, 2.5 or 5 × 10^k — whole numbers only for whole-number data) closest to giving `count` intervals across `span`. */
function niceStep(span: number, count: number, integer: boolean): number {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const units = integer && power < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const unit = units.reduce((best, u) => (Math.abs(Math.log((u * power) / raw)) < Math.abs(Math.log((best * power) / raw)) ? u : best));
  return Math.max(Number((unit * power).toPrecision(3)), integer ? 1 : 0);
}

const INVERSES: Record<AxisScaleKind, Transform> = { linear: (v) => v, log: Math.exp, sqrt: (v) => v * v };

/** How round a value reads — the largest 1/2/2.5/5 × 10^k it's a whole multiple of, 2.5s ranked just below 2s (28 over 27.5, 7.5 over 7). */
function roundness(v: number): number {
  if (v === 0) return Infinity;
  for (let k = 4; k >= -3; k--) {
    for (const m of [5, 2.5, 2, 1]) {
      const u = m * 10 ** k;
      if (Math.abs(v / u - Math.round(v / u)) < 1e-9) return m === 2.5 ? u * 0.7 : u;
    }
  }
  return 0;
}

/**
 * Rule 3: the axis's range, padded in its own (possibly stretched)
 * spacing, then its ticks — round multiples of a round step on a linear
 * axis; on a log/√ axis, spaced evenly in the stretched spacing (at least
 * 1/7 of it apart) taking the roundest value on offer each step (10 over
 * 9, 5 over 4.3).
 */
function buildAxis(min: number, max: number, kind: AxisScaleKind, integer: boolean): AxisScale {
  const t = TRANSFORMS[kind];
  const inv = INVERSES[kind];
  const tSpan = t(max) - t(min) || Math.abs(t(max)) || 1;
  const pad = tSpan * AXIS_PAD;
  // Log can't reach 0; linear and √ start at 0 when the data's lowest
  // value is within ZERO_SNAP_SHARE of the range (or the margin) of it.
  const nearZero = (tv: number) => Math.abs(tv) <= tSpan * ZERO_SNAP_SHARE;
  let lo = inv(t(min) - pad);
  let hi = inv(t(max) + pad);
  if (kind !== "log" && min >= 0 && (t(min) - pad <= 0 || nearZero(t(min)))) lo = 0;
  if (kind === "linear" && max <= 0 && (max + pad >= 0 || nearZero(max))) hi = 0;

  if (kind === "linear") {
    const step = niceStep(hi - lo, 5, integer);
    const decimals = decimalsOf(step);
    const ticks: number[] = [];
    for (let n = Math.ceil(lo / step - 1e-9); n * step <= hi + 1e-9; n++) ticks.push(roundTo(n * step, decimals));
    return { kind, domain: [lo, hi], ticks };
  }

  const fine = Math.max(Number((10 ** Math.floor(Math.log10((hi - lo) / 30))).toPrecision(1)), integer ? 1 : 0);
  const decimals = decimalsOf(fine);
  const candidates: number[] = [];
  for (let n = Math.ceil(lo / fine - 1e-9); n * fine <= hi + 1e-9; n++) candidates.push(roundTo(n * fine, decimals));
  const minGap = (t(hi) - t(lo)) / 7;
  const ticks: number[] = [];
  let from = t(lo) - minGap; // the first tick is the roundest within one gap of the bottom
  let i = 0;
  while (i < candidates.length) {
    while (i < candidates.length && t(candidates[i]) < from + minGap) i++;
    if (i >= candidates.length) break;
    let best = i;
    for (let j = i; j < candidates.length && t(candidates[j]) <= from + 2 * minGap; j++) {
      if (roundness(candidates[j]) > roundness(candidates[best])) best = j;
    }
    ticks.push(candidates[best]);
    from = t(candidates[best]);
    i = best + 1;
  }
  return { kind, domain: [lo, hi], ticks };
}

/** One axis over these values, all three rules applied. */
export function planAxis(values: number[]): AxisScale {
  if (values.length === 0) return { kind: "linear", domain: [0, 1], ticks: [0, 1] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const integer = values.every(Number.isInteger);
  return buildAxis(min, max, chooseScaleKind(values), integer);
}

/** Both axes of a scatter, plus whether its reference line is drawn. */
export function planScatterAxes(xs: number[], ys: number[], showReferenceLine: boolean): ScatterAxesPlan {
  const lineSuppressed = showReferenceLine && scalesMismatched(xs, ys);
  if (showReferenceLine && !lineSuppressed) {
    const shared = planAxis([...xs, ...ys]);
    return { lineSuppressed, drawReferenceLine: true, x: shared, y: shared };
  }
  return { lineSuppressed, drawReferenceLine: false, x: planAxis(xs), y: planAxis(ys) };
}
