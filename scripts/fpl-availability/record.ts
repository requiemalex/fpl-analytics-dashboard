/**
 * Records FPL's availability news for the next deadline into
 * data/fpl-availability/<season>/gwNN.json (<availability_record>,
 * server/src/fplAvailability/reading.ts) — run hourly by
 * .github/workflows/fpl-availability.yml, and safe to run by hand:
 *
 *   npx tsx scripts/fpl-availability/record.ts
 *
 * Writes only when the news has changed since the file was last written,
 * so a quiet hour commits nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { availabilityReading, formatReading, readingChanged, readingPath, type AvailabilityReading } from "../../server/src/fplAvailability/reading.js";
import { FPL_API, getJson } from "../club-history/liveLedger.js";

const USER_AGENT = "Scoutline availability record (+https://github.com/requiemalex/fpl-analytics-dashboard)";

async function main() {
  const bootstrap = await getJson(`${FPL_API}/bootstrap-static/`, USER_AGENT);
  const reading = availabilityReading(bootstrap, new Date());
  if (!reading) {
    console.log("No upcoming deadline (or no players) — nothing to record.");
    return;
  }
  const file = join(process.cwd(), readingPath(reading));
  const previous = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as AvailabilityReading) : null;
  if (!readingChanged(previous, reading)) {
    console.log(`${reading.season} GW${reading.gameweek}: no change since ${previous?.recordedAt}.`);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatReading(reading));
  console.log(`${reading.season} GW${reading.gameweek}: recorded ${reading.players.length} of ${reading.pool} players with news (deadline ${reading.deadline}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
