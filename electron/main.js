const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const os = require("os");
const path = require("path");
const { autoUpdater } = require("electron-updater");

// No File/Edit/View/Window/Help — those are Electron's generic defaults
// (reload, dev tools, zoom, etc.), not anything this app's own UI exposes
// or needs; removing the whole application menu is what actually gets rid
// of that strip, on Windows/Linux at least (macOS always keeps a minimal
// app menu regardless — not a concern since this app is Windows-only for
// now). Must run before any window is created.
Menu.setApplicationMenu(null);

/** The product's name, everywhere a person sees it (window titles, dialogs). */
const APP_NAME = "Scoutline";

/**
 * <saved_data_folder>: the app was called "FPL Analytics Dashboard" until
 * 2026-10-19, and Electron keeps a person's saved data (localStorage: squads,
 * views, notes, settings) in a folder named after the product. Renaming the
 * product would have moved that to a new, empty folder, so every saved
 * squad and view would have seemed lost. The folder keeps its original name
 * for good. Must run before the app is ready.
 */
app.setPath("userData", path.join(app.getPath("appData"), "FPL Analytics Dashboard"));

// <app_log> (electron/log.js): after the userData path above, which the log lives under.
const { log, captureConsole, logFilePath } = require("./log");
captureConsole();
const launchStartedAt = Date.now();
log.info(`${APP_NAME} ${app.getVersion()} starting: Windows ${os.release()} ${process.arch}, Electron ${process.versions.electron}`);

/**
 * An error nothing else caught. Electron's own dialog for this ("A
 * JavaScript error occurred in the main process") shows a raw stack trace
 * and records nothing; this one says what to do and where the details are
 * — once per session, so a repeating error can't stack up dialogs. The app
 * carries on, as it would with Electron's.
 */
let errorDialogShown = false;
process.on("uncaughtException", (err) => {
  log.error("Uncaught error in the main process:", err);
  if (errorDialogShown) return;
  errorDialogShown = true;
  dialog.showErrorBox(
    `${APP_NAME} hit a problem`,
    `Something went wrong: ${err && err.message ? err.message : String(err)}\n\nIf the app stops working, close it and open it again. Your saved data is safe.\n\nDetails were saved to:\n${logFilePath()}`,
  );
});
process.on("unhandledRejection", (reason) => log.error("Unhandled promise rejection in the main process:", reason));
app.on("child-process-gone", (_event, details) => log.warn("Child process gone:", details));

/**
 * A distinct port from the dev-mode default (4000, in server/src/config.ts)
 * — this process never runs alongside the dev server, but picking a
 * separate, less-common port avoids any conflict with something else
 * already running on the user's machine. Set via env var BEFORE the
 * server module loads, since config.ts reads process.env.PORT once, at
 * import time.
 *
 * Always this port, never one from the user's environment: the port is
 * part of the page's address, and saved data (localStorage) belongs to
 * that address, so a PORT variable set for something else would make
 * every saved squad, view and note seem lost (audit 2026-10-18 M5).
 */
const DESKTOP_PORT = "4317";
process.env.PORT = DESKTOP_PORT;
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
  const { createApp, listenOnLoopback } = require(bundlePath);
  const expressApp = createApp({ clientDistPath: path.join(__dirname, "../client/dist") });
  // This computer only, never the network (<loopback_only>, server/src/listen.ts).
  // Port taken (another program on it): rejected and reported, not an uncaught crash with no window (audit 2026-10-18 M5).
  await listenOnLoopback(expressApp, Number(DESKTOP_PORT));
}

const APP_ORIGIN = `http://localhost:${DESKTOP_PORT}`;

/**
 * <navigation_guard>: the app's windows only ever show the app's own pages.
 * A link to anywhere else (the Legal page's data-source links) opens in the
 * person's own browser instead, and only for http(s) — never another
 * window inside the app, and never another kind of address.
 */
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (originOf(url) === APP_ORIGIN) return;
    event.preventDefault();
    openExternally(url);
  });

  // <app_log>: what goes wrong inside a page (its errors, a crash, a failed load) is recorded too.
  contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
    if (level === "error") log.error(`Page error: ${message} (${sourceId}:${lineNumber})`);
  });
  contents.on("render-process-gone", (_event, details) => log.error(`Page process gone (${contents.getURL()}):`, details));
  contents.on("unresponsive", () => log.warn(`Page not responding: ${contents.getURL()}`));
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) log.error(`Page failed to load: ${url} (${code} ${description})`);
  });
  contents.on("preload-error", (_event, preloadPath, error) => log.error(`Preload script failed (${preloadPath}):`, error));
});

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function openExternally(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:") shell.openExternal(url);
  } catch {
    // not a valid address: ignored
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
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

  mainWindow.loadURL(APP_ORIGIN);

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
  if (mainWindow && mainWindowReady && !holdMainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    log.info(`Main window shown ${Date.now() - launchStartedAt} ms after launch`);
  }
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
    title: `Updating ${APP_NAME}`,
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
  autoUpdater.logger = log;

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
      message: `${APP_NAME} ${info.version} is ready to install.`,
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

/**
 * One copy at a time (audit 2026-10-18 M5): a second launch would find the
 * port taken, and could still run an update install under the first. It
 * brings the running copy's window forward and quits instead.
 */
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (mainWindow.isVisible()) mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await startEmbeddedServer();
      log.info(`Built-in server ready ${Date.now() - launchStartedAt} ms after launch`);
    } catch (err) {
      log.error("Built-in server didn't start:", err);
      const inUse = err && err.code === "EADDRINUSE";
      dialog.showErrorBox(
        `${APP_NAME} couldn't start`,
        (inUse
          ? `Another program is using port ${DESKTOP_PORT}, which this app needs. Close that program (or restart the computer) and open the app again. Your saved data is safe.`
          : `The app's built-in server didn't start: ${err && err.message ? err.message : String(err)}. Your saved data is safe.`) +
          `\n\nDetails were saved to:\n${logFilePath()}`,
      );
      app.quit();
      return;
    }
    startUpdateChecks();
    // The launch check runs while the page loads hidden, so an up-to-date launch waits on nothing extra.
    const launchCheck = checkAtLaunch();
    createWindow();
    await launchCheck;

    // macOS convention: clicking the dock icon with no windows open
    // re-creates one rather than doing nothing.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Windows/Linux convention: closing the last window quits the app.
// macOS convention: the app stays running until explicitly quit (Cmd+Q),
// even with no windows open — handled by leaving this to the platform
// default rather than calling app.quit() unconditionally here.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
