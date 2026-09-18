const { app, BrowserWindow, Menu } = require("electron");
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
    // Borderless-but-still-controllable: hides the traditional title bar
    // (no more floating in a small window with a visible OS frame) while
    // titleBarOverlay keeps native minimize/maximize/close buttons, drawn
    // in the app's own colours instead of Windows' default light theme —
    // Windows-only API (Window Controls Overlay); harmless no-op on other
    // platforms if this is ever built for them.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#161f1a", // --surface-raised
      symbolColor: "#e8ede9", // --text-primary
      height: 36,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The app never needs Node or Electron APIs from the page itself
      // — it's the same web app that already runs in a regular browser
      // — so no preload script is needed to bridge anything across.
    },
  });

  mainWindow.loadURL(`http://localhost:${process.env.PORT}`);

  // Maximized by default ("fullscreen borderless", not literal OS
  // fullscreen — that would also hide the taskbar, which isn't wanted for
  // a productivity dashboard). Waiting for ready-to-show avoids a visible
  // jump from the initial small size to maximized.
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Checks GitHub Releases (see package.json's build.publish config) for a
 * newer tagged version than this running one, downloads it in the
 * background if found, and shows a native OS notification prompting a
 * restart once it's ready — electron-updater's own default UI, no custom
 * dialog needed for this. This is the entire "push a fix, every install
 * gets it" mechanism: a new git tag → CI builds + publishes a release
 * (.github/workflows/release.yml) → every running copy of the app finds
 * it here on its next launch.
 *
 * A no-op in dev (`npm run electron:start`) — electron-updater checks
 * `app.isPackaged` internally and skips entirely for an unpackaged run,
 * so this never tries to hit GitHub while iterating locally. Errors
 * (most commonly: no internet connection) are caught and logged rather
 * than surfaced to the user — a failed update check should never block
 * or interrupt using the app itself.
 */
function checkForUpdates() {
  autoUpdater.on("error", (err) => console.error("Auto-update error:", err));
  autoUpdater.on("update-available", (info) => console.log("Update available:", info.version));
  autoUpdater.on("update-not-available", () => console.log("No update available — already on the latest version."));
  autoUpdater.on("update-downloaded", (info) => console.log("Update downloaded, will prompt to restart:", info.version));

  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("Auto-update check failed:", err));
}

app.whenReady().then(async () => {
  await startEmbeddedServer();
  createWindow();
  checkForUpdates();

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
