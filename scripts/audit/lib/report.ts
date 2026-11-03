/**
 * Collects probe issues and prints only what needs a look, one line each,
 * grouped and de-duplicated. Every detail (repro steps, all occurrences,
 * timings) goes to a JSON file for drill-down, so the console stays short.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Capture, Scan } from "./browser";

export interface Issue {
  probe: string;
  kind: string;
  where: string;
  detail: string;
  repro?: string[];
}

export class Report {
  issues: Issue[] = [];
  notes: string[] = [];
  measurements: Record<string, unknown>[] = [];

  add(issue: Issue) { this.issues.push(issue); }
  note(line: string) { this.notes.push(line); }
  measure(m: Record<string, unknown>) { this.measurements.push(m); }

  /** Turns a page scan and its captured errors into issues. */
  fromPage(probe: string, where: string, s: Scan, c: Capture, repro?: string[]) {
    if (s.crashed) this.add({ probe, kind: "crash", where, detail: s.crashed, repro });
    else if (s.blank) this.add({ probe, kind: "blank page", where, detail: "the page shows almost no text", repro });
    for (const e of c.pageErrors) this.add({ probe, kind: "uncaught error", where, detail: e, repro });
    for (const e of c.consoleErrors) this.add({ probe, kind: "console error", where, detail: e, repro });
    for (const t of s.badText) this.add({ probe, kind: "bad value shown", where, detail: t, repro });
    if (s.horizontalScroll) this.add({ probe, kind: "page scrolls sideways", where, detail: `content ${s.horizontalScroll}px wide`, repro });
    for (const t of s.clipped) this.add({ probe, kind: "text cut off", where, detail: t, repro });
  }

  print(title: string, outDir: string, extra: Record<string, unknown> = {}): number {
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${title}.json`);
    writeFileSync(file, JSON.stringify({ ...extra, notes: this.notes, issues: this.issues, measurements: this.measurements }, null, 2));
    // One line per distinct problem; where it happened is folded together.
    const groups = new Map<string, { issue: Issue; where: Set<string> }>();
    for (const i of this.issues) {
      const key = `${i.probe}|${i.kind}|${i.detail}`;
      const g = groups.get(key) ?? { issue: i, where: new Set<string>() };
      g.where.add(i.where);
      groups.set(key, g);
    }
    for (const n of this.notes) console.log(`  · ${n}`);
    const lines = [...groups.values()].sort((a, b) => rank(a.issue.kind) - rank(b.issue.kind));
    for (const { issue, where } of lines.slice(0, 40)) {
      const places = [...where];
      const at = places.length > 3 ? `${places.slice(0, 3).join(", ")} +${places.length - 3} more` : places.join(", ");
      console.log(`  ! [${issue.probe}] ${issue.kind}: ${issue.detail}  — ${at}`);
    }
    if (lines.length > 40) console.log(`  … ${lines.length - 40} more distinct issues in the JSON`);
    console.log(lines.length ? `${lines.length} distinct issue(s). Repro steps and every occurrence: ${file}` : `No issues. Detail: ${file}`);
    return lines.length;
  }
}

const ORDER = ["crash", "uncaught error", "blank page", "no error shown", "did not recover", "bad value shown", "re-fetched shared data", "duplicate requests", "console error", "page scrolls sideways", "text cut off", "slow"];
function rank(kind: string) { const i = ORDER.indexOf(kind); return i < 0 ? ORDER.length : i; }
