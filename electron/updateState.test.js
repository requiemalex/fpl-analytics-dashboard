// Run by `npm test` (node's own test runner: the Electron folder has no build step).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readUpdateState, writeUpdateState, compareVersions, reviewInstallAttempt, checkedRecently } = require("./updateState");

test("<update_state> a missing or damaged file reads as an empty state, never an error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-state-"));
  const file = path.join(dir, "update-state.json");
  assert.deepEqual(readUpdateState(file), {});
  fs.writeFileSync(file, "{not json");
  assert.deepEqual(readUpdateState(file), {});
  fs.writeFileSync(file, "null");
  assert.deepEqual(readUpdateState(file), {});
  assert.equal(writeUpdateState(file, { upToDate: { version: "1.2.3", at: 5 } }), true);
  assert.deepEqual(readUpdateState(file), { upToDate: { version: "1.2.3", at: 5 } });
  assert.equal(writeUpdateState(path.join(dir, "missing-folder", "x.json"), {}), false);
});

test("versions compare part by part, as numbers", () => {
  assert.equal(compareVersions("1.100.1", "1.99.0"), 1);
  assert.equal(compareVersions("1.99.0", "1.100.1"), -1);
  assert.equal(compareVersions("1.100.1", "1.100.1"), 0);
  assert.equal(compareVersions("2.0", "1.100.9"), 1);
});

test("an install attempt: installed if that version is running, failed if an older one still is", () => {
  const attempt = { installAttempt: { version: "1.101.0", at: "2026-10-23T09:00:00Z" } };
  assert.deepEqual(reviewInstallAttempt(attempt, "1.101.0"), { outcome: "installed", version: "1.101.0" });
  assert.deepEqual(reviewInstallAttempt(attempt, "1.100.1"), { outcome: "failed", version: "1.101.0" });
  // A newer version already running (installed by hand since): nothing to report.
  assert.deepEqual(reviewInstallAttempt(attempt, "1.102.0"), { outcome: "none" });
  assert.deepEqual(reviewInstallAttempt({}, "1.100.1"), { outcome: "none" });
  assert.deepEqual(reviewInstallAttempt({ installAttempt: {} }, "1.100.1"), { outcome: "none" });
});

test("a recent up-to-date check counts only for the same version, and only within the window", () => {
  const state = { upToDate: { version: "1.100.1", at: 1_000_000 } };
  const tenMin = 10 * 60 * 1000;
  assert.equal(checkedRecently(state, "1.100.1", 1_000_000 + tenMin - 1, tenMin), true);
  assert.equal(checkedRecently(state, "1.100.1", 1_000_000 + tenMin, tenMin), false);
  assert.equal(checkedRecently(state, "1.101.0", 1_000_001, tenMin), false);
  // A clock set back: not trusted as recent.
  assert.equal(checkedRecently(state, "1.100.1", 999_999, tenMin), false);
  assert.equal(checkedRecently({}, "1.100.1", 1_000_000, tenMin), false);
});
