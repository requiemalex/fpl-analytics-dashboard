const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

// No File/Edit/View/Window/Help — those are Electron's generic defaults
// (reload, dev tools, zoom, etc.), not anything this app's own UI exposes
// or needs; removing the whole application menu is what actually gets rid
// of that strip, on Windows/Linux at least (macOS always keeps a minimal
// app menu regardless — not a concern since this app is Windows-only for
// now). Must run before any window is created.
Menu.setApplicationMenu(null);

/**
 * A distinct port from the dev-mode default (4000, in server/src/config.ts)
 * — this process never runs alongside the dev server, but picking a
 * separate, less-common port avoids any conflict with something else
 * already running on the user's machine. Set via env var BEFORE the
 * server module loads, since config.ts reads process.env.PORT once, at
 * import time.
 */
process.env.PORT = process.env.PORT ?? "4317";
process.env.CLIENT_ORIGIN = `http://localhost:${process.env.PORT}`;

let mainWindow = null;
let mainWindowReady = false;
/** True until the launch update check has decided the app can open as it is. */
let holdMainWindow = true;

/**
 * Starts the embedded server and resolves once it's actually listening —
 * the window must not try to load the URL before that.
 *
 * <build_prerequisite>: this requires server/dist/app.bundle.cjs, produced
 * by `npm run build:electron-server` (esbuild, bundling app.ts and its
 * dependencies — express, cors — into one self-contained CommonJS file).
 * That's deliberate: this is an npm-workspaces monorepo with dependencies
 * hoisted to the root node_modules, and having the packaged app rely on
 * electron-builder correctly resolving that from server/'s own
 * package.json is a real, untestable-from-here risk — a single bundled
 * file needs no node_modules resolution at runtime at all. See the root
 * README for the exact build commands.
 *
 * CJS, not ESM: esbuild's ESM output has no real `require` in scope, so
 * anything it can't statically resolve into an import (a dependency doing
 * a dynamic `require(x)` — body-parser's `depd` dependency does exactly
 * this, for the built-in "path" module) gets replaced with a shim that
 * throws "Dynamic require of ... is not supported" the moment it runs.
 * CJS output keeps a real, working `require` in scope, so that same call
 * just works — confirmed by actually hitting the ESM version's failure
 * on a real Windows run and fixing it, not reasoned through untested.
 */
async function startEmbeddedServer() {
  const bundlePath = path.join(__dirname, "../server/dist/app.bundle.cjs");
  const { createApp } = require(bundlePath);
  const expressApp = createApp({ clientDistPath: path.join(__dirname, "../client/dist") });
  await new Promise((resolve) => {
    expressApp.listen(process.env.PORT, resolve);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "FPL Analytics Dashboard",
    icon: path.join(__dirname, "../build/icon.png"),
    show: false,
    backgroundColor: "#0a0f0c", // matches --bg (tokens.css) — avoids a white flash before the page paints
    // No OS frame at all (no title bar, no native min/max/close buttons —
    // those are drawn by the app's own topbar instead, see preload.js +
    // AppShell.tsx) and true OS fullscreen rather than just maximized:
    // on Windows a fullscreen window also auto-hides the taskbar on the
    // monitor it's shown on, which is what actually makes the app fill
    // the entire screen edge-to-edge.
    frame: false,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Only bridge exposed: minimize/close, for the custom topbar
      // controls that replace the native window chrome removed above.
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://localhost:${process.env.PORT}`);

  mainWindowReady = false;
  mainWindow.once("ready-to-show", () => {
    mainWindowReady = true;
    showMainWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/** Shows the main window once its page is ready and the launch update check (see checkAtLaunch) has let it through. */
function showMainWindow() {
  if (mainWindow && mainWindowReady && !holdMainWindow && !mainWindow.isVisible()) mainWindow.show();
}

// The only window-control surface left now that the native frame is gone —
// backs the custom minimize/close buttons rendered in AppShell.tsx's
// topbar. Deliberately not exposing anything broader (no full Node/Electron
// API bridge) since the page content is the same web app that also runs in
// a plain browser tab.
ipcMain.on("window-minimize", () => {
  mainWindow?.minimize();
});
ipcMain.on("window-close", () => {
  mainWindow?.close();
});

/** How often a running copy looks for a new release, on top of the check at launch. */
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** How long launch waits to hear whether there's an update before opening the app anyway. */
const LAUNCH_CHECK_TIMEOUT_MS = 8000;
/** How long a launch-time download may go without progress before the app opens anyway. */
const LAUNCH_DOWNLOAD_STALL_MS = 30000;

/** Set while an update found at launch downloads and installs before the app opens: { window, stallTimer, installing }. */
let launchUpdate = null;

/**
 * Update on open: nothing runs while the app is closed, so a release
 * published since it was last used is installed here, before the main
 * window appears — the main window loads hidden meanwhile. If the check
 * finds an update, a small "Updating…" window shows the download, then the
 * app installs it silently and relaunches on the new version. No answer
 * within LAUNCH_CHECK_TIMEOUT_MS (slow network), no internet, or a stalled
 * or failed download all just open the app as it is; the running-app
 * checks in startUpdateChecks carry on from there.
 */
async function checkAtLaunch() {
  const result = await Promise.race([
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Launch update check failed:", err);
      return null;
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), LAUNCH_CHECK_TIMEOUT_MS)),
  ]);
  if (result?.isUpdateAvailable) beginLaunchUpdate(result.updateInfo.version);
  else openAppAsIs();
}

function openAppAsIs() {
  holdMainWindow = false;
  showMainWindow();
}

/** How long the finished "Update downloaded" state stays on screen before the app closes to install. */
const LAUNCH_INSTALL_DELAY_MS = 900;

function beginLaunchUpdate(version) {
  const window = new BrowserWindow({
    width: 400,
    height: 206,
    frame: false,
    // Transparent, so the page's rounded card is the window's shape.
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: "Updating FPL Analytics Dashboard",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  window.loadFile(path.join(__dirname, "update-window.html"), { query: { version } });
  window.once("ready-to-show", () => window.show());
  // Closing this window mid-download quits, rather than leaving the hidden main window running with nothing on screen.
  window.on("closed", () => {
    if (launchUpdate?.window === window && !launchUpdate.installing) app.quit();
  });
  launchUpdate = { window, stallTimer: null, installing: false };
  resetLaunchStallTimer();
}

function resetLaunchStallTimer() {
  clearTimeout(launchUpdate.stallTimer);
  launchUpdate.stallTimer = setTimeout(() => {
    console.error("Launch update download stalled — opening the app as it is.");
    abandonLaunchUpdate();
  }, LAUNCH_DOWNLOAD_STALL_MS);
}

/** Gives up on updating before opening: the app opens as it is, and a download still going finishes in the background (the running-app dialog then offers it). */
function abandonLaunchUpdate() {
  if (!launchUpdate) return;
  const { window, stallTimer } = launchUpdate;
  clearTimeout(stallTimer);
  launchUpdate = null;
  if (!window.isDestroyed()) window.close();
  openAppAsIs();
}

/**
 * Checks GitHub Releases (see package.json's build.publish config) for a
 * newer tagged version than this running one — at launch (checkAtLaunch)
 * and then every UPDATE_CHECK_INTERVAL_MS while the app stays open — and
 * downloads it in the background. Once a running-app download is ready, a
 * dialog offers to restart into it straight away; "Later" leaves it to
 * install when the app is next closed (electron-updater's
 * autoInstallOnAppQuit). This is the entire "push a fix, every install
 * gets it" mechanism: a new git tag → CI builds + publishes a release
 * (.github/workflows/release.yml) → every open copy of the app finds it
 * here within minutes, and every closed one installs it on next open.
 *
 * Checking stops once an update has downloaded: a later check would find
 * the same version and raise the dialog again after "Later".
 *
 * A no-op in dev (`npm run electron:start`) — electron-updater checks
 * `app.isPackaged` internally and skips entirely for an unpackaged run,
 * so this never tries to hit GitHub while iterating locally (the launch
 * check resolves at once and the app opens). Errors (most commonly: no
 * internet connection) are caught and logged rather than surfaced to the
 * user — a failed update check should never block or interrupt using the
 * app itself; the next scheduled check tries again.
 */
function startUpdateChecks() {
  let checkTimer = null;

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
    abandonLaunchUpdate();
  });
  autoUpdater.on("update-available", (info) => console.log("Update available:", info.version));
  autoUpdater.on("update-not-available", () => console.log("No update available — already on the latest version."));
  autoUpdater.on("download-progress", (progress) => {
    if (!launchUpdate || launchUpdate.window.isDestroyed()) return;
    resetLaunchStallTimer();
    launchUpdate.window.webContents.executeJavaScript(`setProgress(${Number(progress.percent) || 0})`).catch(() => {});
  });
  autoUpdater.on("update-downloaded", async (info) => {
    console.log("Update downloaded:", info.version);
    clearInterval(checkTimer);
    if (launchUpdate) {
      clearTimeout(launchUpdate.stallTimer);
      launchUpdate.installing = true;
      const { window } = launchUpdate;
      if (!window.isDestroyed()) window.webContents.executeJavaScript("setDownloaded()").catch(() => {});
      // Silent install (no installer wizard), then relaunch on the new version — after a moment, so the finished state is seen.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), LAUNCH_INSTALL_DELAY_MS);
      return;
    }
    const options = {
      type: "info",
      title: "Update ready",
      message: `FPL Analytics Dashboard ${info.version} is ready to install.`,
      detail: "Restart now to update, or choose Later and it will install the next time you close the app.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    // Silent install (no installer wizard), then relaunch the app.
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });

  checkTimer = setInterval(
    () => autoUpdater.checkForUpdates().catch((err) => console.error("Auto-update check failed:", err)),
    UPDATE_CHECK_INTERVAL_MS,
  );
}

app.whenReady().then(async () => {
  startUpdateChecks();
  // The launch check runs while the server starts and the page loads hidden, so an up-to-date launch waits on nothing extra.
  const launchCheck = checkAtLaunch();
  await startEmbeddedServer();
  createWindow();
  await launchCheck;

  // macOS convention: clicking the dock icon with no windows open
  // re-creates one rather than doing nothing.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows/Linux convention: closing the last window quits the app.
// macOS convention: the app stays running until explicitly quit (Cmd+Q),
// even with no windows open — handled by leaving this to the platform
// default rather than calling app.quit() unconditionally here.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
