import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import express from "express";
import cors from "cors";
import { CORS_ORIGIN } from "./config.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { fixturesRouter } from "./routes/fixtures.js";
import { elementSummaryRouter } from "./routes/elementSummary.js";
import { eventLiveRouter } from "./routes/eventLive.js";
import { historicBulkRouter } from "./routes/historicBulk.js";
import { entryImportRouter } from "./routes/entryImport.js";

/**
 * Builds the configured Express app WITHOUT starting it — callers decide
 * the port and when to call `.listen()`. Split out from index.ts so the
 * exact same app (routes, middleware, static-serving) can be started two
 * ways: the normal standalone entry point (index.ts, for `npm run dev`
 * and `npm start`), and the Electron main process, which imports this
 * directly rather than spawning a second process and having to resolve
 * its own dependencies/paths when packaged.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: CORS_ORIGIN }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "fpl-dashboard-server", time: new Date().toISOString() });
  });

  app.use("/api", bootstrapRouter);
  app.use("/api", fixturesRouter);
  app.use("/api", elementSummaryRouter);
  app.use("/api", eventLiveRouter);
  app.use("/api", historicBulkRouter);
  app.use("/api", entryImportRouter);

  // Serves the built client (client/dist) whenever it's present —
  // production standalone runs and the packaged Electron app both hit
  // this; a plain `npm run dev` never has a client/dist to find, so this
  // block simply does nothing extra there. Checking for the built
  // files' actual presence, rather than an environment flag, means one
  // fewer thing to configure correctly when packaging for Electron.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.join(__dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Anything not matched above (an API route, or a real static file)
    // falls through to here — for a client-side route like
    // "/team-building" there's no matching file, so this hands back
    // index.html and lets React Router take over. /api/* paths are
    // explicitly excluded so a genuinely unmatched API call still hits
    // the JSON 404 handler below instead of getting index.html back.
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // Controlled fallback for anything unexpected, rather than an unhandled
  // exception bubbling up as a raw stack trace to the client.
  app.use((req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error:", err);
    res.status(500).json({ error: "Internal proxy error" });
  });

  return app;
}
