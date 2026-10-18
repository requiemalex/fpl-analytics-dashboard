import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import { PORT } from "./config.js";

// Run from a checkout (npm run dev / npm start), Understat data is read
// straight from data/understat/; the packaged desktop app has no such
// folder and reads the published copy instead (server/src/understat/route.ts).
const localUnderstat = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/understat");

createApp({ understatLocalDir: existsSync(localUnderstat) ? localUnderstat : undefined }).listen(PORT, () => {
  console.log(`FPL dashboard API proxy listening on http://localhost:${PORT}`);
});
