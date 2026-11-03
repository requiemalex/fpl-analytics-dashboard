/**
 * `npm run check [-- <test filter>] [--no-build]`
 *
 * The build (type-check) and every test suite, reported in a few lines:
 * one line when all is well, and only the failures (name + first lines of
 * the reason) when not. Same checks as `npm run build` + `npm test`, without
 * the ~80 KB of passing-test output. A filter (e.g. `metrics/`) runs only
 * matching test files and skips the Electron tests unless it matches them.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const args = process.argv.slice(2);
const filters = args.filter((a) => !a.startsWith("--"));
const noBuild = args.includes("--no-build");
const ANSI = /\x1b\[[0-9;]*m/g;
const tmp = mkdtempSync(join(tmpdir(), "scoutline-check-"));
const lines: string[] = [];
let failed = false;

function run(cmd: string, cwd = ROOT) {
  const t = Date.now();
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(ANSI, ""), secs: Math.round((Date.now() - t) / 1000) };
}

if (!noBuild) {
  const b = run("npm run build");
  if (b.ok) lines.push(`build ok (${b.secs}s)`);
  else {
    failed = true;
    const errs = b.out.split("\n").filter((l) => /error TS\d+|\berror\b|Error:/.test(l)).slice(0, 25);
    lines.push(`BUILD FAILED (${b.secs}s):`, ...errs.map((l) => `  ${l.trim()}`));
  }
}

interface VitestJson {
  numTotalTests: number; numPassedTests: number; numFailedTests: number; numPendingTests: number; numTodoTests: number;
  testResults: { name: string; status: string; message?: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
}

for (const ws of ["server", "client"]) {
  const file = join(tmp, `${ws}.json`);
  const r = run(`npx vitest run --reporter=json --outputFile="${file}" --passWithNoTests ${filters.join(" ")}`, join(ROOT, ws));
  let json: VitestJson | null = null;
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch { /* reported below */ }
  if (!json && /No test files found/.test(r.out)) { lines.push(`${ws} tests: none match ${filters.join(" ")}`); continue; }
  if (!json) {
    failed = true;
    lines.push(`${ws} tests DIDN'T RUN (${r.secs}s):`, ...r.out.trim().split("\n").slice(-12).map((l) => `  ${l}`));
    continue;
  }
  const skipped = json.numPendingTests + json.numTodoTests;
  const head = `${ws} tests ${json.numPassedTests}/${json.numTotalTests} passed${skipped ? `, ${skipped} skipped` : ""} (${r.secs}s)`;
  const broken = json.testResults.filter((f) => f.status === "failed" && f.assertionResults.every((a) => a.status !== "failed"));
  if (!json.numFailedTests && !broken.length) { lines.push(head); continue; }
  failed = true;
  lines.push(`${head}: ${json.numFailedTests} FAILED`);
  for (const f of json.testResults) {
    const rel = f.name.replace(/\\/g, "/").split(`/${ws}/`).pop();
    for (const a of f.assertionResults.filter((x) => x.status === "failed").slice(0, 10)) {
      const why = (a.failureMessages[0] ?? "").replace(ANSI, "").split("\n").filter((l) => l.trim() && !/node_modules/.test(l)).slice(0, 4).map((l) => `      ${l.trim().slice(0, 200)}`);
      lines.push(`  ✖ ${rel} › ${a.fullName}`, ...why);
    }
  }
  for (const f of broken) lines.push(`  ✖ ${f.name.replace(/\\/g, "/").split(`/${ws}/`).pop()} didn't load: ${(f.message ?? "").split("\n")[0].slice(0, 200)}`);
}

if (!filters.length || filters.some((f) => /electron/i.test(f))) {
  const e = run('node --test "electron/*.test.js"');
  const n = (k: string) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(e.out)?.[1] ?? 0);
  if (e.ok) lines.push(`electron tests ${n("pass")}/${n("tests")} passed (${e.secs}s)`);
  else {
    failed = true;
    lines.push(`electron tests ${n("fail")} FAILED (${e.secs}s):`, ...e.out.split("\n").filter((l) => /✖/.test(l)).slice(0, 15).map((l) => `  ${l.trim()}`));
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(lines.join("\n"));
process.exit(failed ? 1 : 0);
