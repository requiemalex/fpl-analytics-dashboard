/** "2025/26" -> 2025: the calendar year a season name starts in. */
export function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/** 2025 -> "2025/26". */
export function seasonNameFromStartYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/** "2025/26" -> "25/26": the form a season axis has room for; hover shows the full name. */
export function shortSeason(seasonName: string): string {
  return /^\d{4}\//.test(seasonName) ? seasonName.slice(2) : seasonName;
}
