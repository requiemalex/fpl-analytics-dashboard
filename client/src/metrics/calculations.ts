/**
 * All derived metrics live here, centralised, so no component duplicates a
 * formula. Every function follows <zero_handling>:
 *  - division by zero → null
 *  - any null input → null
 *  - never NaN / Infinity / undefined
 */

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

function safeSubtract(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

export function pointsPerMillion(totalPoints: number | null, priceInMillions: number | null): number | null {
  return safeDivide(totalPoints, priceInMillions);
}

export function xGPerMillion(xG: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xG, priceInMillions);
}

export function xAPerMillion(xA: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xA, priceInMillions);
}

export function xGIPerMillion(xGI: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xGI, priceInMillions);
}

/** total / minutes * 90 — the general per-90 shape for metrics with no API-supplied per-90 equivalent. */
export function per90(total: number | null, minutes: number | null): number | null {
  const perMinute = safeDivide(total, minutes);
  if (perMinute === null) return null;
  return perMinute * 90;
}

export function minutesPerPoint(minutes: number | null, totalPoints: number | null): number | null {
  return safeDivide(minutes, totalPoints);
}

export function minutesPerGoal(minutes: number | null, goals: number | null): number | null {
  return safeDivide(minutes, goals);
}

export function minutesPerAssist(minutes: number | null, assists: number | null): number | null {
  return safeDivide(minutes, assists);
}

export function goalsMinusXG(goals: number | null, xG: number | null): number | null {
  return safeSubtract(goals, xG);
}

export function assistsMinusXA(assists: number | null, xA: number | null): number | null {
  return safeSubtract(assists, xA);
}

export function goalInvolvementsMinusXGI(goals: number | null, assists: number | null, xGI: number | null): number | null {
  if (goals === null || assists === null || xGI === null) return null;
  return goals + assists - xGI;
}
