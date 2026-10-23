const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require("electron");
const os = require("os");
const path = require("path");
const { autoUpdater } = require("electron-updater");

// No File/Edit/View/Window/Help — those are Electron's generic defaults
// (reload, dev tools, zoom, etc.), not anything this app's own UI exposes
// or needs; removing the whole application menu is what actually gets rid
// of that strip. Must run before any window is created.
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
const { readUpdateState, writeUpdateState, reviewInstallAttempt, checkedRecently } = require("./updateState");
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
 * The page's address: always http://localhost:4317, because saved data
 * (localStorage) belongs to the address, so a different one would make
 * every saved squad, view and note seem lost (audit 2026-10-18 M5).
 *
 * <app_address>: nothing actually listens on port 4317. The app answers
 * that address itself (answerAppAddress below) and passes each request on
 * to the built-in server, which takes whatever port is free. Before, the
 * server had to get 4317 itself, and couldn't open at all if another
 * program had it: an OpenTelemetry agent (4317 is its standard port), or a
 * block of ports Windows reserves for Hyper-V, WSL or Docker (audit
 * 2026-10-23, finding 4).
 */
const DESKTOP_PORT = "4317";
const APP_ORIGIN = `http://localhost:${DESKTOP_PORT}`;
const APP_HOST = `localhost:${DESKTOP_PORT}`;

let mainWindow = null;
let mainWindowReady = false;
/** True until the launch update check has decided the app can open as it is. */
let holdMainWindow = true;

/** Resolves with the built-in server's port once it's listening; requests to the app's address wait on it. */
let serverReady = null;

/**
 * Starts the embedded server on any free port of 127.0.0.1 (this computer
 * only: <loopback_only>, server/src/listen.ts) and resolves with that port
 * once it's actually listening — the window must not load before that.
 *
 * <build_prerequisite>: this requires server/dist/app.bundle.cjs, produced
 * by `npm run build:electron-server` (esbuild, bundling app.ts and its
 * dependencies — express — into one self-contained CommonJS file).
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
 *
 * In this process, not a separate one: a separate process was tried
 * (2026-10-23) and measured no faster, since the server's heavy work waits
 * on the network far more than it computes — the windows stayed just as
 * responsive either way (at most ~20 ms of delay during a full historic
 * build).
 */
function startEmbeddedServer() {
  serverReady = (async () => {
    const { createApp, listenOnLoopback } = require(path.join(__dirname, "../server/dist/app.bundle.cjs"));
    const expressApp = createApp({
      clientDistPath: path.join(__dirname, "../client/dist"),
      // The last good copy of what a launch needs (<disk_copies>, server/src/diskCopies.ts).
      dataCacheDir: path.join(app.getPath("userData"), "data-cache"),
    });
    return listenOnLoopback(expressApp, 0, "127.0.0.1");
  })();
  return serverReady;
}

/** A JSON error the page shows like any other failed request (the client reads `error`). */
function serverUnavailable(message) {
  return new Response(JSON.stringify({ error: message }), { status: 503, headers: { "content-type": "application/json" } });
}

/**
 * <app_address>: requests to the page's address go to the built-in
 * server; anything else over http goes out as normal. Only this session's
 * (the windows'); electron-updater fetches through a session of its own.
 */
function answerAppAddress() {
  protocol.handle("http", async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    let port;
    try {
      port = await serverReady;
    } catch {
      return serverUnavailable(`${APP_NAME}'s built-in server isn't running.`);
    }
    try {
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
      return await net.fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body,
        bypassCustomProtocolHandlers: true,
      });
    } catch (err) {
      log.warn(`Request to the built-in server failed (${request.method} ${url.pathname}):`, err);
      return serverUnavailable(`${APP_NAME}'s built-in server didn't answer. Try again in a moment.`);
    }
  });
}

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

/** How long the main window's page may take to draw before it's reloaded, and then before the app gives up. */
const MAIN_WINDOW_READY_TIMEOUT_MS = 20000;
/** Times in a session the main window's page is reloaded after its process crashed or it failed to load. */
const MAIN_WINDOW_MAX_RECOVERIES = 3;

let mainWindowRecoveries = 0;

/**
 * <window_watchdog>: the app never stays running with nothing on screen
 * (audit 2026-10-23, finding 3). The main window loads hidden and shows
 * once its page has drawn; before this, a page that never drew (a crashed
 * page process, a graphics driver problem, a failed load) left the app
 * running invisibly, holding the one-copy lock, so every later click on its
 * icon did nothing until a restart. Now a failed load or a crashed page is
 * reloaded (up to MAIN_WINDOW_MAX_RECOVERIES times), a page that hasn't
 * drawn within MAIN_WINDOW_READY_TIMEOUT_MS is reloaded once, and if it
 * still can't open, the app says so and quits, freeing the lock.
 */
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
  const window = mainWindow;

  // A failed load is handled (and logged) below, not left as an unhandled rejection.
  window.loadURL(APP_ORIGIN).catch(() => {});

  mainWindowReady = false;
  let readyTimer = null;
  let reloadedForTimeout = false;
  const startReadyTimer = () => {
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => {
      if (mainWindowReady || window.isDestroyed()) return;
      if (reloadedForTimeout) return failMainWindow(`hadn't drawn after ${(2 * MAIN_WINDOW_READY_TIMEOUT_MS) / 1000} seconds`);
      reloadedForTimeout = true;
      log.warn(`Main window hadn't drawn after ${MAIN_WINDOW_READY_TIMEOUT_MS / 1000} seconds: reloading it`);
      window.reload();
      startReadyTimer();
    }, MAIN_WINDOW_READY_TIMEOUT_MS);
  };
  startReadyTimer();

  window.once("ready-to-show", () => {
    clearTimeout(readyTimer);
    mainWindowReady = true;
    showMainWindow();
  });

  const recover = (what) => {
    if (window.isDestroyed()) return;
    if (mainWindowRecoveries >= MAIN_WINDOW_MAX_RECOVERIES) return failMainWindow(what);
    mainWindowRecoveries += 1;
    log.warn(`Main window ${what}: reloading it (${mainWindowRecoveries} of ${MAIN_WINDOW_MAX_RECOVERIES} this session)`);
    setTimeout(() => !window.isDestroyed() && window.loadURL(APP_ORIGIN).catch(() => {}), 1000);
  };
  window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    // -3 (ERR_ABORTED): a load replaced by another one, not a failure.
    if (isMainFrame && code !== -3) recover("failed to load its page");
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") recover(`page process stopped (${details.reason})`);
  });

  window.on("closed", () => {
    clearTimeout(readyTimer);
    if (mainWindow === window) mainWindow = null;
  });
  window.on("session-end", () => {
    sessionEnding = true;
    log.info("Windows is shutting down or signing out");
  });
}

/** The main window can't be opened: say so, with where the details are, and quit rather than stay running unseen. */
function failMainWindow(what) {
  log.error(`Main window ${what}: giving up and quitting`);
  closeLaunchWindow();
  dialog.showErrorBox(
    `${APP_NAME} couldn't open`,
    `The app's window ${what}. Open the app again; if it keeps happening, restart the computer. Your saved data is safe.\n\nDetails were saved to:\n${logFilePath()}`,
  );
  app.quit();
}

/** Shows the main window once its page is ready and the launch update check (see checkAtLaunch) has let it through. */
function showMainWindow() {
  if (mainWindow && mainWindowReady && !holdMainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    closeLaunchWindow();
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

/** How long opening may take before the launch window appears: a quick launch goes straight to the app, with no flash of it. */
const LAUNCH_WINDOW_DELAY_MS = 1000;

/** The <launch_window>, from launch until the main window shows: { window, loaded, showWhenLoaded, closing }. */
let launch = null;

/**
 * Created hidden as the app starts, and shown only if opening takes longer
 * than LAUNCH_WINDOW_DELAY_MS, or straight away when the launch check
 * finds an update: before this, a launch waiting on a slow update check
 * showed nothing at all for up to 8 seconds, and a second click on the icon
 * then seemed to do nothing either (audit 2026-10-23, Efficiency B).
 */
function createLaunchWindow() {
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
    title: APP_NAME,
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  launch = { window, loaded: false, showWhenLoaded: false, closing: false };
  const current = launch;
  window
    .loadFile(path.join(__dirname, "launch-window.html"), { query: { version: app.getVersion() } })
    .catch((err) => log.warn("Launch window didn't load:", err));
  window.once("ready-to-show", () => {
    current.loaded = true;
    if (current.showWhenLoaded && !window.isDestroyed()) window.show();
  });
  // Closed by the person (Alt+F4) while the app is still opening or updating: quit, rather than leave a hidden main window running.
  window.on("closed", () => {
    if (launch === current) launch = null;
    if (!current.closing && !launchUpdate?.installing && !mainWindow?.isVisible()) app.quit();
  });
  setTimeout(() => showLaunchWindow(), LAUNCH_WINDOW_DELAY_MS);
}

function showLaunchWindow() {
  if (!launch || launch.window.isDestroyed() || mainWindow?.isVisible()) return;
  if (launch.loaded) launch.window.show();
  else launch.showWhenLoaded = true;
}

function closeLaunchWindow() {
  if (!launch) return;
  launch.closing = true;
  if (!launch.window.isDestroyed()) launch.window.close();
  launch = null;
}

/** Runs one of launch-window.html's functions, if the window's still there. */
function tellLaunchWindow(script) {
  if (!launch || launch.window.isDestroyed()) return;
  launch.window.webContents.executeJavaScript(script).catch(() => {});
}

/** How often a running copy looks for a new release, on top of the check at launch. */
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** How long launch waits to hear whether there's an update before opening the app anyway (the check carries on behind it). */
const LAUNCH_CHECK_TIMEOUT_MS = 4000;
/** How long a launch-time download may go without progress before the app opens anyway. */
const LAUNCH_DOWNLOAD_STALL_MS = 30000;
/** How long the finished "Update downloaded" state stays on screen before the app closes to install. */
const LAUNCH_INSTALL_DELAY_MS = 900;

/** Set while an update found at launch downloads and installs before the app opens: { version, stallTimer, installing }. */
let launchUpdate = null;
/** The version downloaded and waiting to install, once there is one. */
let downloadedVersion = null;
/** Set once an installer has been started this session, so it's never started twice. */
let installStarted = false;
/** Set when Windows says it's shutting down, restarting or signing out. */
let sessionEnding = false;

const UPDATE_STATE_FILE = path.join(app.getPath("userData"), "update-state.json");
let updateState = readUpdateState(UPDATE_STATE_FILE);
/** A version whose install didn't take last time: this launch opens without trying it again (<update_state>). */
let skipLaunchInstallOf = null;

/** At launch: did the install started last time work? Then forgets it, so it's judged once. */
function reviewLastInstall() {
  const review = reviewInstallAttempt(updateState, app.getVersion());
  if (updateState.installAttempt) {
    delete updateState.installAttempt;
    writeUpdateState(UPDATE_STATE_FILE, updateState);
  }
  if (review.outcome === "installed") log.info(`Updated to ${review.version}`);
  if (review.outcome === "failed") {
    skipLaunchInstallOf = review.version;
    log.warn(`The update to ${review.version} didn't install last time: opening as it is, and offering it again once it has downloaded`);
  }
}

/**
 * Starts the downloaded update's installer, after noting the attempt
 * (<update_state>). With its own small progress window, never fully silent:
 * a silent install showed nothing for the 10–30 seconds it ran, and opening
 * the app in that gap started the old copy while its files were being
 * replaced (audit 2026-10-23, finding 2). `relaunch`: reopen the app once
 * installed (launch and "Restart now"); not when the person closed it. The
 * installer reopens it only when told to (--force-run): package.json's
 * nsis.runAfterFinish is off, as a visible one-click install otherwise
 * always reopens the app, even after the person closed it.
 */
function installUpdate(version, { relaunch }) {
  if (installStarted) return;
  installStarted = true;
  updateState.installAttempt = { version, at: new Date().toISOString() };
  writeUpdateState(UPDATE_STATE_FILE, updateState);
  log.info(`Installing ${version}${relaunch ? ", then reopening" : " as the app closes"}`);
  if (relaunch) autoUpdater.quitAndInstall(false, true);
  else autoUpdater.install(false, false);
}

/**
 * Update on open: nothing runs while the app is closed, so a release
 * published since it was last used is installed here, before the main
 * window appears — the main window loads hidden meanwhile. If the check
 * finds an update, the launch window shows the download, then the app
 * closes, the installer shows its progress and reopens the app on the new
 * version. No answer within LAUNCH_CHECK_TIMEOUT_MS (slow network), no
 * internet, or a stalled or failed download all just open the app as it
 * is; the running-app checks in startUpdateChecks carry on from there. A
 * launch soon after a check found nothing new doesn't wait on another
 * (within UPDATE_CHECK_INTERVAL_MS, as a running copy would), and one after
 * a failed install doesn't try that version again before opening.
 */
async function checkAtLaunch() {
  if (checkedRecently(updateState, app.getVersion(), Date.now(), UPDATE_CHECK_INTERVAL_MS)) {
    log.info("Up to date as of a few minutes ago: opening without waiting, checking again behind it");
    openAppAsIs();
    autoUpdater.checkForUpdates().catch((err) => console.error("Update check failed:", err));
    return;
  }
  const startedAt = Date.now();
  const result = await Promise.race([
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Launch update check failed:", err);
      return null;
    }),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), LAUNCH_CHECK_TIMEOUT_MS)),
  ]);
  const ms = Date.now() - startedAt;
  if (result === "timeout") log.warn(`Launch update check: no answer within ${LAUNCH_CHECK_TIMEOUT_MS} ms, opening as it is`);
  const version = result && result !== "timeout" && result.isUpdateAvailable ? result.updateInfo.version : null;
  if (version && version === skipLaunchInstallOf) {
    log.info(`Launch update check found ${version} (${ms} ms), which didn't install last time: opening as it is`);
    openAppAsIs();
  } else if (version) {
    log.info(`Launch update check found ${version} (${ms} ms): updating before opening`);
    beginLaunchUpdate(version);
  } else {
    if (result && result !== "timeout") log.info(`Launch update check: up to date (${ms} ms)`);
    openAppAsIs();
  }
}

function openAppAsIs() {
  holdMainWindow = false;
  showMainWindow();
}

function beginLaunchUpdate(version) {
  launchUpdate = { version, stallTimer: null, installing: false };
  tellLaunchWindow(`startUpdate(${JSON.stringify(version)})`);
  showLaunchWindow();
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
  clearTimeout(launchUpdate.stallTimer);
  launchUpdate = null;
  openAppAsIs();
}

/**
 * Checks GitHub Releases (see package.json's build.publish config) for a
 * newer tagged version than this running one — at launch (checkAtLaunch)
 * and then every UPDATE_CHECK_INTERVAL_MS while the app stays open — and
 * downloads it in the background. Once a running-app download is ready, a
 * dialog offers to restart into it straight away; "Later" leaves it to
 * install when the app is next closed (installUpdate, from the quit handler
 * below: electron-updater's own install-on-quit is always silent, so it's
 * off). This is the entire "push a fix, every install gets it" mechanism:
 * a new git tag → CI builds + publishes a release
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
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
    abandonLaunchUpdate();
  });
  autoUpdater.on("update-available", (info) => console.log("Update available:", info.version));
  autoUpdater.on("update-not-available", () => {
    console.log("No update available — already on the latest version.");
    updateState.upToDate = { version: app.getVersion(), at: Date.now() };
    writeUpdateState(UPDATE_STATE_FILE, updateState);
  });
  autoUpdater.on("download-progress", (progress) => {
    if (!launchUpdate) return;
    resetLaunchStallTimer();
    tellLaunchWindow(`setProgress(${Number(progress.percent) || 0})`);
  });
  autoUpdater.on("update-downloaded", async (info) => {
    console.log("Update downloaded:", info.version);
    clearInterval(checkTimer);
    downloadedVersion = info.version;
    if (launchUpdate) {
      clearTimeout(launchUpdate.stallTimer);
      launchUpdate.installing = true;
      tellLaunchWindow("setDownloaded()");
      // After a moment, so the finished state is seen.
      setTimeout(() => installUpdate(info.version, { relaunch: true }), LAUNCH_INSTALL_DELAY_MS);
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
    if (response === 0) installUpdate(info.version, { relaunch: true });
  });

  // "Later": the downloaded update installs as the app closes (an ordinary close only, not a crash). Not when
  // Windows is shutting down: an installer cut off half-way would leave a broken copy. The next launch installs it.
  app.on("quit", (_event, exitCode) => {
    if (!downloadedVersion || installStarted || exitCode !== 0) return;
    if (sessionEnding) log.info(`Not installing ${downloadedVersion} while Windows shuts down: the next launch will`);
    else installUpdate(downloadedVersion, { relaunch: false });
  });

  checkTimer = setInterval(
    () => autoUpdater.checkForUpdates().catch((err) => console.error("Auto-update check failed:", err)),
    UPDATE_CHECK_INTERVAL_MS,
  );
}

/**
 * One copy at a time (audit 2026-10-18 M5): two copies would share one
 * saved-data folder, and a second could run an update install under the first. It
 * brings the running copy's window forward and quits instead — the launch
 * window while the first copy is still opening or updating.
 */
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) {
  log.info("Already open: brought the open copy forward");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isVisible()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (launch && !launch.window.isDestroyed()) {
      showLaunchWindow();
      launch.window.focus();
    }
  });

  app.whenReady().then(async () => {
    reviewLastInstall();
    createLaunchWindow();
    answerAppAddress();
    try {
      await startEmbeddedServer();
      log.info(`Built-in server ready ${Date.now() - launchStartedAt} ms after launch`);
    } catch (err) {
      log.error("Built-in server didn't start:", err);
      closeLaunchWindow();
      dialog.showErrorBox(
        `${APP_NAME} couldn't start`,
        `The app's built-in server didn't start: ${err && err.message ? err.message : String(err)}. Open the app again; if it keeps happening, restart the computer. Your saved data is safe.\n\nDetails were saved to:\n${logFilePath()}`,
      );
      app.quit();
      return;
    }
    startUpdateChecks();
    // The launch check runs while the page loads hidden, so an up-to-date launch waits on nothing extra.
    const launchCheck = checkAtLaunch();
    createWindow();
    await launchCheck;
  });
}

// Closing the last window quits the app.
app.on("window-all-closed", () => app.quit());
