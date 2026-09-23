/** Minimal RFC 4180 CSV reader/writer — enough for the club-history files and the vaastav archive (quoted names containing commas), with no dependency. */

export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [header, ...rows] = records;
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
}

function csvField(value: string | number | boolean | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(csvField).join(","))].join("\n") + "\n";
}

/** "" → null, anything else → a finite number or null (never NaN). */
export function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function numOrZero(value: string | undefined): number {
  return numOrNull(value) ?? 0;
}

export function boolField(value: string | undefined): boolean {
  return value === "True" || value === "true" || value === "1";
}
