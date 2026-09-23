/**
 * Takes the project's frozen copy of the vaastav/Fantasy-Premier-League
 * files the club-history backfill reads (see vaastavSnapshot.ts for the
 * layout), pinned to one commit of that repository. Run once — the
 * snapshot is committed, and from then on nothing in the project reads
 * vaastav online.
 *
 *   npx tsx scripts/club-history/snapshot-vaastav.ts [--force]
 *
 * Refuses to replace an existing snapshot without --force: it's a
 * preservation copy, and the committed club history was built from it.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { toCsv } from "../../server/src/clubHistory/csv.js";
import { SEASON_FILES, SNAPSHOT_ROOT, SNAPSHOT_SEASONS, VAASTAV_REPO, sha256, type SnapshotManifest } from "./vaastavSnapshot.js";

async function getText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.ok) return await res.text();
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${url}: failed after 4 attempts`);
}

async function main() {
  const manifestPath = join(SNAPSHOT_ROOT, "manifest.json");
  if (existsSync(manifestPath) && !process.argv.includes("--force")) {
    throw new Error(`A vaastav snapshot already exists at ${SNAPSHOT_ROOT} — pass --force to replace it.`);
  }

  const head = (await (await fetch(`https://api.github.com/repos/${VAASTAV_REPO}/commits/master`)).json()) as { sha?: string };
  if (!head.sha) throw new Error("Couldn't read the vaastav repository's current commit.");
  const base = `https://raw.githubusercontent.com/${VAASTAV_REPO}/${head.sha}/data`;

  const manifest: SnapshotManifest = { source: `https://github.com/${VAASTAV_REPO}`, commit: head.sha, takenAt: new Date().toISOString(), files: {} };
  const save = (path: string, source: string, text: string) => {
    const out = join(SNAPSHOT_ROOT, `${path}.gz`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, gzipSync(text, { level: 9 }));
    manifest.files[path] = { source, bytes: Buffer.byteLength(text, "utf8"), sha256: sha256(text) };
  };

  const master = await getText(`${base}/master_team_list.csv`);
  if (master === null) throw new Error("master_team_list.csv is missing from the archive.");
  save("master_team_list.csv", "data/master_team_list.csv", master);

  for (const season of SNAPSHOT_SEASONS) {
    for (const file of SEASON_FILES) {
      const source = `data/${season}/${file.source}`;
      const text = await getText(`${base}/${season}/${file.source}`);
      if (text === null) {
        if (!file.optional) throw new Error(`${source} is missing from the archive.`);
        continue;
      }
      save(`${season}/${file.name}`, source, text);
      console.log(`${source}: ${(Buffer.byteLength(text) / 1e6).toFixed(2)} MB`);
    }
  }

  // Short names for clubs whose only Premier League seasons predate the
  // archive's teams.csv (2019-20) — the backfill prefers a real short name
  // from any later season, the official bootstrap included. Saved here so
  // a rerun of the backfill gives the same answer years from now.
  const bootstrap = (await (await fetch("https://fantasy.premierleague.com/api/bootstrap-static/")).json()) as { teams: { code: number; short_name: string }[] };
  save(
    "fpl-team-short-names.csv",
    "https://fantasy.premierleague.com/api/bootstrap-static/ (teams)",
    toCsv(["code", "short_name"], bootstrap.teams.map((t) => [t.code, t.short_name])),
  );

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Snapshot of ${VAASTAV_REPO}@${head.sha.slice(0, 7)}: ${Object.keys(manifest.files).length} files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
