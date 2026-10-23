const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const util = require("util");

/**
 * <app_log>: the desktop app's own record of what happened, kept on this
 * computer only (never sent anywhere): launches, update checks, and every
 * error, from the app itself, the built-in server, the updater and the
 * pages. A packaged app has no console, so without this an error leaves
 * nothing behind to diagnose (audit 2026-10-23, finding 1).
 *
 * In the saved-data folder (<saved_data_folder>): logs/scoutline.log. Past
 * MAX_BYTES at a launch it starts afresh, keeping the previous one as
 * scoutline.old.log, so the two together never pass about 2 MB.
 */
const MAX_BYTES = 1024 * 1024;

const original = { info: console.log, warn: console.warn, error: console.error };
let file = null;

function logFilePath() {
  if (file) return file;
  const dir = path.join(app.getPath("userData"), "logs");
  file = path.join(dir, "scoutline.log");
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, "scoutline.old.log"));
  } catch {
    // no log yet, or the folder can't be written: write() copes
  }
  return file;
}

function write(level, args) {
  original[level](...args);
  try {
    fs.appendFileSync(logFilePath(), `${new Date().toISOString()} [${level}] ${util.format(...args)}\n`);
  } catch {
    // a log that can't be written must never stop the app
  }
}

/** Also the updater's logger (autoUpdater.logger), which may call debug. */
const log = {
  info: (...args) => write("info", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
  debug: () => {},
};

/** Sends console output in this process (the built-in server's included) to the log too. */
function captureConsole() {
  console.log = log.info;
  console.info = log.info;
  console.warn = log.warn;
  console.error = log.error;
}

module.exports = { log, captureConsole, logFilePath };
