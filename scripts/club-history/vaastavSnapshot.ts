/**
 * The project's own frozen copy of every vaastav/Fantasy-Premier-League
 * file the club-history backfill reads — data/vaastav-snapshot/. Taken once
 * by snapshot-vaastav.ts so the look-back record never depends on that
 * repository staying online: backfill-vaastav.ts reads only from here.
 *
 *   data/vaastav-snapshot/
 *     manifest.json                  source repo + pinned commit, and every file's sha256
 *     master_team_list.csv.gz
 *     fpl-team-short-names.csv.gz    code,short_name from the official bootstrap at snapshot time
 *     <season, e.g. 2025-26>/players_raw.csv.gz
 *                            merged_gw.csv.gz     (vaastav's gws/merged_gw.csv)
 *                            fixtures.csv.gz      (2018-19 on)
 *                            teams.csv.gz         (2019-20 on)
 *
 * Files are the archive's raw CSVs, every column kept (cards, ICT, price,
 * ownership, transfers, …) — not just what today's ledger uses — gzipped.
 * The sha256 in the manifest is of the uncompressed CSV, as served.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCsv } from "../../server/src/clubHistory/csv.js";

export const SNAPSHOT_ROOT = join(process.cwd(), "data", "vaastav-snapshot");
export const VAASTAV_REPO = "vaastav/Fantasy-Premier-League";
export const SNAPSHOT_SEASONS = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"];

/** Per season: snapshot file name → path inside the vaastav repo's data/<season>/, and whether the archive has it for every season. */
export const SEASON_FILES: { name: string; source: string; optional: boolean }[] = [
  { name: "players_raw.csv", source: "players_raw.csv", optional: false },
  { name: "merged_gw.csv", source: "gws/merged_gw.csv", optional: false },
  { name: "fixtures.csv", source: "fixtures.csv", optional: true },
  { name: "teams.csv", source: "teams.csv", optional: true },
];

export interface SnapshotManifest {
  source: string;
  commit: string;
  takenAt: string;
  /** Keyed by snapshot path (e.g. "2025-26/merged_gw.csv"), without the .gz. */
  files: Record<string, { source: string; bytes: number; sha256: string }>;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

let manifest: SnapshotManifest | null = null;
function loadManifest(): SnapshotManifest {
  if (!manifest) {
    const path = join(SNAPSHOT_ROOT, "manifest.json");
    if (!existsSync(path)) throw new Error(`No vaastav snapshot at ${SNAPSHOT_ROOT} — run scripts/club-history/snapshot-vaastav.ts first.`);
    manifest = JSON.parse(readFileSync(path, "utf8")) as SnapshotManifest;
  }
  return manifest;
}

/** Reads one snapshot CSV, checking it against the manifest's sha256. `null` when the manifest has no such file (a season the archive doesn't cover it for). */
export function readSnapshotCsv(path: string): Record<string, string>[] | null {
  const entry = loadManifest().files[path];
  if (!entry) return null;
  const text = gunzipSync(readFileSync(join(SNAPSHOT_ROOT, `${path}.gz`))).toString("utf8");
  if (sha256(text) !== entry.sha256) throw new Error(`vaastav snapshot ${path} doesn't match its manifest checksum — the file has been altered or corrupted.`);
  return parseCsv(text);
}
