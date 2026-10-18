import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * <understat_separation> (the owner's first rule for Understat): FPL code
 * must never depend on Understat code, so Understat can be removed in one
 * go — delete client/src/understat/, server/src/understat/,
 * scripts/understat/, data/understat/ and the sync workflow, plus the one
 * marked connection line in each of client/src/App.tsx and
 * server/src/app.ts — and the FPL app still builds and runs unchanged.
 * This proves no other file imports it.
 */

const CLIENT_SRC = join(__dirname, "..");
const SERVER_SRC = join(__dirname, "..", "..", "..", "server", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "understat" || name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function filesImportingUnderstat(root: string): string[] {
  return sourceFiles(root)
    .filter((path) => /from\s+["'][^"']*\/understat\/|import\(["'][^"']*\/understat\//.test(readFileSync(path, "utf8")))
    .map((path) => relative(root, path).replace(/\\/g, "/"));
}

describe("Understat stays separate from the FPL app", () => {
  it("only App.tsx connects the client to it", () => {
    expect(filesImportingUnderstat(CLIENT_SRC)).toEqual(["App.tsx"]);
  });
  it("only app.ts connects the server to it", () => {
    expect(filesImportingUnderstat(SERVER_SRC)).toEqual(["app.ts"]);
  });
});
