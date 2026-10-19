import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { createApp, listenOnLoopback } from "./app.js";
import { PORT } from "./config.js";

// Run from a checkout (npm run dev / npm start), Understat data is read
// straight from data/understat/; the packaged desktop app has no such
// folder and reads the published copy instead (server/src/understat/route.ts).
const localUnderstat = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/understat");

const app = createApp({ understatLocalDir: existsSync(localUnderstat) ? localUnderstat : undefined });
listenOnLoopback(app, PORT, process.env.HOST).then(
  () => console.log(`API proxy listening on http://localhost:${PORT}`),
  (err) => {
    console.error(`API proxy couldn't start on port ${PORT}:`, err);
    process.exit(1);
  },
);
