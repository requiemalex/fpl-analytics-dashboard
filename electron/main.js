const { app, BrowserWindow } = require("electron");
const path = require("path");

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
 * <build_prerequisite>: this imports server/dist/app.bundle.js, produced
 * by `npm run build:electron-server` (esbuild, bundling app.ts and its
 * dependencies — express, cors — into one self-contained file). That's
 * deliberate: this is an npm-workspaces monorepo with dependencies
 * hoisted to the root node_modules, and having the packaged app rely on
 * electron-builder correctly resolving that from server/'s own
 * package.json is a real, untestable-from-here risk — a single bundled
 * file needs no node_modules resolution at runtime at all. See the root
 * README for the exact build commands.
 */
async function startEmbeddedServer() {
  const { createApp } = await import(path.join(__dirname, "../server/dist/app.bundle.js"));
  const expressApp = createApp();
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The app never needs Node or Electron APIs from the page itself
      // — it's the same web app that already runs in a regular browser
      // — so no preload script is needed to bridge anything across.
    },
  });

  mainWindow.loadURL(`http://localhost:${process.env.PORT}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startEmbeddedServer();
  createWindow();

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
