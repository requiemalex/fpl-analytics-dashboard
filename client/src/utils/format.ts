const DASH = "\u2014";

function isDisplayable(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
}

export function fmtNumber(n: number | null | undefined, decimals = 0): string {
  if (!isDisplayable(n)) return DASH;
  return n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtDecimal(n: number | null | undefined, decimals = 2): string {
  return fmtNumber(n, decimals);
}

export function fmtPrice(n: number | null | undefined): string {
  if (!isDisplayable(n)) return DASH;
  return `\u00a3${n.toFixed(1)}m`;
}

export function fmtPercent(n: number | null | undefined, decimals = 1): string {
  if (!isDisplayable(n)) return DASH;
  return `${n.toFixed(decimals)}%`;
}

export function fmtSigned(n: number | null | undefined, decimals = 2): string {
  if (!isDisplayable(n)) return DASH;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    return new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return DASH;
  }
}

export function fmtTimeAgo(epochMs: number | null | undefined): string {
  if (!epochMs) return DASH;
  const diffSec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export { DASH };
