/**
 * Bar widths for a tile's rows (TopList, TeamTopList): the top row, the
 * tile's leader, is always full length, and a shorter bar shows how far
 * behind the leader a row is (User Guide, Dashboard).
 *
 * Highest First, or any +/- metric: width = |value| ÷ the largest |value|.
 * Lowest First on a non-negative metric (the top row holds the smallest
 * value: price, league position, goals against): width = leader ÷ value,
 * so a row twice the leader's figure is half as long. Using |value| ÷ the
 * largest there gave the leader the shortest bar (audit 2026-10-18 M16).
 * Never below 4% for a real value, so a row is always visible; 0 for null.
 */
export function barWidths(values: (number | null)[], signed = false): number[] {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return values.map(() => 0);
  const top = real[0];
  const min = Math.min(...real);
  const max = Math.max(...real);
  const lowestFirst = !signed && min >= 0 && top === min && top < max;
  const maxAbs = Math.max(...real.map(Math.abs));
  return values.map((v) => {
    if (v === null) return 0;
    if (lowestFirst) {
      if (v === top) return 100;
      return v <= 0 ? 100 : Math.max(4, (top / v) * 100);
    }
    return maxAbs <= 0 ? 0 : Math.max(4, (Math.abs(v) / maxAbs) * 100);
  });
}
