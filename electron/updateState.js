const fs = require("fs");

/**
 * <update_state>: what the launch needs to remember between runs about
 * updating, kept in update-state.json in the saved-data folder:
 *
 * - `installAttempt` { version, at }: written just before an update's
 *   installer starts. The next launch compares it with the version that's
 *   running: the same version means it installed; an older one means it
 *   didn't (an antivirus block, a locked file, the installer cancelled), and
 *   that launch opens the app as it is instead of closing to try again, so a
 *   failing update can't close the app on every launch (audit 2026-10-23,
 *   finding 5). It's then offered again the running-app way.
 * - `upToDate` { version, at }: the last check that found nothing newer. A
 *   launch soon after one doesn't wait on another check before opening.
 *
 * Reading never throws: a missing or damaged file is an empty state.
 */
function readUpdateState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    return state && typeof state === "object" ? state : {};
  } catch {
    return {};
  }
}

function writeUpdateState(file, state) {
  try {
    fs.writeFileSync(file, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** -1, 0 or 1 for two "1.100.1"-style versions (the release tags' form). */
function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * What the last install attempt, if any, says now that the app is running
 * `runningVersion`: "installed", "failed" (still older than what was being
 * installed), or "none" (no attempt, or one this version has already passed).
 */
function reviewInstallAttempt(state, runningVersion) {
  const attempt = state.installAttempt;
  if (!attempt || typeof attempt.version !== "string") return { outcome: "none" };
  if (attempt.version === runningVersion) return { outcome: "installed", version: attempt.version };
  if (compareVersions(attempt.version, runningVersion) > 0) return { outcome: "failed", version: attempt.version };
  return { outcome: "none" };
}

/** Whether this version found itself up to date less than `withinMs` before `now`. */
function checkedRecently(state, runningVersion, now, withinMs) {
  const last = state.upToDate;
  if (!last || last.version !== runningVersion || typeof last.at !== "number") return false;
  const age = now - last.at;
  return age >= 0 && age < withinMs;
}

module.exports = { readUpdateState, writeUpdateState, compareVersions, reviewInstallAttempt, checkedRecently };
