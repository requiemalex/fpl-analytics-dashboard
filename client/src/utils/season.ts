/** "2025/26" -> 2025: the calendar year a season name starts in. */
export function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/** 2025 -> "2025/26". */
export function seasonNameFromStartYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}
