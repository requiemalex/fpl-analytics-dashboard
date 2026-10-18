/**
 * One sync run (scripts/understat/sync.ts; daily via
 * .github/workflows/understat-sync.yml). In order, stopping at the first
 * thing that can't be trusted:
 *
 *  1. The off-switch (control.json): when off, nothing is fetched.
 *  2. Per season, oldest first: fetch what's new from Understat (the live
 *     season's new and recent matches; a season not yet stored, a few per
 *     run), shape-checked as it arrives.
 *  3. Pair clubs and fixtures by result (pairing.ts); every score must
 *     agree. The live season pairs against FPL's record fetched this run
 *     (liveLedger), not the twice-weekly archive, so new matches are
 *     checked the day FPL confirms them.
 *  4. Re-check every saved player link, then link new players
 *     (matcher.ts).
 *  5. Accuracy checks (checks.ts), and a cap on how many links may change
 *     in one run.
 *  6. Only if all of that passed: write every file. A failed run writes
 *     nothing, so the app keeps the last good data. The app's figures
 *     count only matches paired with an FPL fixture, so checked.
 *
 * The returned report is plain English: the workflow turns its
 * "attention" lines into the GitHub issue that emails the owner.
 */
import { readSeasonLedger, type SeasonLedger } from "../../clubHistory/ledgerFiles.js";
import type { LedgerRow } from "../../clubHistory/types.js";
import { buildAppSeason } from "./aggregate.js";
import { checkAgainstFpl, checkSeasonInternally } from "./checks.js";
import {
  ensureOverridesFile,
  readControl,
  readLinks,
  readOverrides,
  readSeasonData,
  readStatus,
  writeAppSeason,
  writeLinks,
  writeSeasonData,
  writeStatus,
  type SeasonData,
} from "./files.js";
import { linkSeason, type FplPlayerSeason, type UsPlayerSeason } from "./matcher.js";
import { pairClubsAndFixtures } from "./pairing.js";
import { UnderstatBlockedError, UnderstatFormatError, type UnderstatClient } from "./understatApi.js";
import type { FplName } from "./names.js";
import type { AppSeasonFile, UnderstatStatus, UsTeamMatch } from "./types.js";

export const FIRST_SEASON = "2016/17";
/** Matches this recent are fetched again on every run, to pick up Understat's own corrections. */
const RECENT_DAYS = 7;
/** A held link older than this, or a finished match Understat still lacks after this many days, goes in the alert. */
const HELD_ALERT_DAYS = 14;
const MISSING_ALERT_DAYS = 2;
/** More links than this changing in one run means something upstream is wrong. */
const MAX_LINK_CHANGE_SHARE = 0.05;
const MATCHES_PER_SEASON = 380;

export type FailureKind = "blocked" | "format" | "checks" | "error";

export interface SyncReport {
  ok: boolean;
  failure?: { kind: FailureKind; message: string };
  /** Needs the owner (the workflow emails these). */
  attention: string[];
  summary: string[];
  warnings: string[];
}

export interface SyncOptions {
  understatRoot: string;
  clubHistoryRoot: string;
  /** FPL bootstrap-static: the live season's name and today's players (names, permanent codes). */
  bootstrap: unknown;
  /** The live season's FPL record, fetched this run (scripts/club-history/liveLedger.ts). Without it the archived one is used, with a warning. */
  liveLedger?: SeasonLedger | null;
  client: UnderstatClient;
  /** YYYY-MM-DD */
  today: string;
  /** New (not yet stored) completed seasons to fetch this run. */
  maxNewSeasons: number;
  log?: (line: string) => void;
}

const startYear = (season: string) => parseInt(season.slice(0, 4), 10);
const seasonName = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function liveSeasonFrom(bootstrap: unknown): string | null {
  const events = (bootstrap as { events?: { id: number; deadline_time: string }[] }).events ?? [];
  const first = events.find((e) => e.id === 1) ?? events[0];
  if (!first) return null;
  const year = new Date(first.deadline_time).getUTCFullYear();
  return Number.isFinite(year) ? seasonName(year) : null;
}

function currentPlayers(bootstrap: unknown): Map<number, FplName> {
  const elements = (bootstrap as { elements?: { code: number; first_name: string; second_name: string; web_name: string }[] }).elements ?? [];
  return new Map(elements.map((e) => [e.code, { first: e.first_name, second: e.second_name, web: e.web_name }]));
}

function isStoredComplete(data: SeasonData | null): boolean {
  if (!data) return false;
  const results = data.matches.filter((m) => m.isResult);
  const withLineups = new Set(data.appearances.map((a) => a.matchId));
  return results.length >= MATCHES_PER_SEASON && results.every((m) => withLineups.has(m.id));
}

export async function runSync(opts: SyncOptions): Promise<SyncReport> {
  const log = opts.log ?? (() => undefined);
  const report: SyncReport = { ok: true, attention: [], summary: [], warnings: [] };
  const errors: string[] = [];
  try {
    const control = readControl(opts.understatRoot);
    if (!control.enabled) {
      report.summary.push(`Understat is switched off in data/understat/control.json${control.note ? ` (${control.note})` : ""} — nothing fetched.`);
      return report;
    }
    const liveSeason = liveSeasonFrom(opts.bootstrap);
    if (!liveSeason) throw new Error("Couldn't work out the live season from FPL's bootstrap-static");
    const players = currentPlayers(opts.bootstrap);
    const previousLinks = readLinks(opts.understatRoot);
    let links = new Map(previousLinks);
    const overrides = readOverrides(opts.understatRoot);
    const previousStatus = readStatus(opts.understatRoot);

    const seasons: string[] = [];
    for (let y = startYear(FIRST_SEASON); y <= startYear(liveSeason); y++) seasons.push(seasonName(y));

    let newSeasonBudget = opts.maxNewSeasons;
    const seeds = new Map<number, string>();
    const toWrite: SeasonData[] = [];
    const processed: { data: SeasonData; complete: boolean; ledgerRows: LedgerRow[]; matchByFixture: Map<number, string> }[] = [];
    const missingFixtures: Record<string, string> = {};

    for (const season of seasons) {
      const isLive = season === liveSeason;
      const freshLedger = isLive && opts.liveLedger?.season === season ? opts.liveLedger : null;
      const ledger = freshLedger ?? readSeasonLedger(opts.clubHistoryRoot, season);
      if (!ledger) {
        report.warnings.push(`${season}: no club-history record to pair with — skipped.`);
        continue;
      }
      if (isLive && !freshLedger) {
        report.warnings.push(`${season}: FPL's live record couldn't be fetched, so this run checked against the archived one; Understat matches FPL confirmed since the last archive wait for a later run.`);
      }
      const stored = readSeasonData(opts.understatRoot, season);
      const storedComplete = isStoredComplete(stored);
      let data: SeasonData;
      let fetched = false;
      const titleById = new Map((stored?.clubs ?? []).map((c) => [c.understatTeamId, c.understatTitle]));

      if (!isLive && storedComplete) {
        data = stored!;
      } else {
        if (!stored && !isLive) {
          if (newSeasonBudget <= 0) {
            report.summary.push(`${season}: not downloaded yet (a few seasons per run).`);
            continue;
          }
          newSeasonBudget -= 1;
        }
        const league = await opts.client.league(startYear(season), { fresh: true });
        const have = new Set((stored?.appearances ?? []).map((a) => a.matchId));
        const recentCutoff = new Date(Date.parse(opts.today) - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
        const wanted = league.matches.filter((m) => m.isResult && (!have.has(m.id) || (isLive && m.datetime.slice(0, 10) >= recentCutoff)));
        log(`${season}: fetching ${wanted.length} match${wanted.length === 1 ? "" : "es"} from Understat…`);
        const refetched = new Set(wanted.map((m) => m.id));
        let appearances = (stored?.appearances ?? []).filter((a) => !refetched.has(a.matchId));
        let shots = (stored?.shots ?? []).filter((s) => !refetched.has(s.matchId));
        for (const m of wanted) {
          const match = await opts.client.match(m.id, { fresh: isLive });
          appearances = appearances.concat(match.appearances);
          shots = shots.concat(match.shots);
        }
        const matchIdByTeamAndTime = new Map<string, string>();
        for (const m of league.matches) {
          matchIdByTeamAndTime.set(`${m.homeTeamId}|${m.datetime}`, m.id);
          matchIdByTeamAndTime.set(`${m.awayTeamId}|${m.datetime}`, m.id);
        }
        const teamMatches: (UsTeamMatch & { matchId: string })[] = [];
        for (const team of league.teams) {
          for (const h of team.history) {
            const matchId = matchIdByTeamAndTime.get(`${h.teamId}|${h.datetime}`);
            if (!matchId) errors.push(`${season}: Understat club ${team.title} has a played match on ${h.datetime} that isn't in the fixture list`);
            else teamMatches.push({ ...h, matchId });
          }
        }
        for (const t of league.teams) titleById.set(t.id, t.title);
        data = {
          season,
          clubs: stored?.clubs ?? [],
          matches: league.matches,
          teamMatches,
          appearances,
          shots,
        };
        fetched = true;
      }

      // --- clubs and fixtures, by result ---
      const results = data.matches
        .filter((m) => m.isResult && m.homeGoals !== null && m.awayGoals !== null)
        .map((m) => ({ id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals!, awayGoals: m.awayGoals! }));
      const usTeamIds = [...new Set(data.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
      const finished = ledger.fixtures
        .filter((f) => f.finished && f.teamHScore !== null && f.teamAScore !== null)
        .map((f) => ({ id: f.id, teamH: f.teamH, teamA: f.teamA, homeGoals: f.teamHScore!, awayGoals: f.teamAScore! }));
      const pairing = pairClubsAndFixtures(ledger.teams, finished, results, usTeamIds, seeds);
      errors.push(...pairing.problems.map((p) => `${season}: ${p}`));
      if (!isLive && pairing.unmatchedFixtures.length > 0) {
        errors.push(`${season}: ${pairing.unmatchedFixtures.length} finished fixtures have no Understat match, in a completed season`);
      }
      if (isLive) {
        for (const id of pairing.unmatchedFixtures) missingFixtures[String(id)] = previousStatus?.missingFixtures?.[String(id)] ?? opts.today;
      }
      const codeByTeamId = new Map(ledger.teams.map((t) => [t.id, t.code]));
      data.clubs = [...pairing.teamByFplId.entries()].map(([fplId, usId]) => ({
        fplTeamCode: codeByTeamId.get(fplId)!,
        understatTeamId: usId,
        understatTitle: titleById.get(usId) ?? "",
      }));
      for (const c of data.clubs) seeds.set(c.fplTeamCode, c.understatTeamId);

      // --- players ---
      const fplSeason = new Map<number, FplPlayerSeason>();
      for (const row of ledger.rows) {
        const name = players.get(row.code);
        if (!name) continue; // player analysis covers today's FPL players only
        const p = fplSeason.get(row.code) ?? { code: row.code, name, minutesByFixture: new Map(), teamIds: new Set<number>() };
        p.minutesByFixture.set(row.fixture, row.minutes);
        if (row.minutes > 0) p.teamIds.add(row.team);
        fplSeason.set(row.code, p);
      }
      const resultIds = new Set(results.map((r) => r.id));
      const usSeason = new Map<string, UsPlayerSeason>();
      for (const a of data.appearances) {
        if (!resultIds.has(a.matchId)) continue;
        const u = usSeason.get(a.playerId) ?? { id: a.playerId, name: a.playerName, minutesByMatch: new Map(), teamIds: new Set<string>() };
        u.minutesByMatch.set(a.matchId, a.minutes);
        if (a.minutes > 0) u.teamIds.add(a.teamId);
        usSeason.set(a.playerId, u);
      }
      const linked = linkSeason({
        season,
        today: opts.today,
        fpl: [...fplSeason.values()],
        us: [...usSeason.values()],
        matchByFixture: pairing.matchByFixture,
        teamByFplId: pairing.teamByFplId,
        links,
        overrides,
      });
      links = linked.links;
      if (linked.events.length > 0) report.summary.push(...linked.events.map((e) => `${season}: ${e}`));

      const internal = checkSeasonInternally(data);
      errors.push(...internal.errors);
      report.warnings.push(...internal.warnings);
      if (fetched) toWrite.push(data);
      processed.push({ data, complete: !isLive && isStoredComplete(data), ledgerRows: ledger.rows, matchByFixture: pairing.matchByFixture });
      log(`${season}: ${results.length} results, ${pairing.matchByFixture.size}/${finished.length} FPL fixtures paired.`);
    }

    // Goals comparison with FPL (a wrong-links guard, not a rule that the sources agree) uses the final links (a link made in a later season covers earlier ones too).
    let compared = 0;
    for (const p of processed) {
      const fplCheck = checkAgainstFpl(p.data, p.ledgerRows, p.matchByFixture, links);
      compared += fplCheck.compared;
      errors.push(...fplCheck.errors);
      report.warnings.push(...fplCheck.warnings);
    }

    // <link_change_cap>
    const previouslyConfirmed = [...previousLinks.values()].filter((l) => l.status === "confirmed");
    const changed = previouslyConfirmed.filter((l) => {
      const now = links.get(l.fplCode);
      return !now || now.status !== "confirmed" || now.understatId !== l.understatId;
    });
    if (previouslyConfirmed.length >= 50 && changed.length > previouslyConfirmed.length * MAX_LINK_CHANGE_SHARE) {
      errors.push(`${changed.length} of ${previouslyConfirmed.length} saved player links would change in one run — too many to be real, so nothing was saved`);
    }

    if (errors.length > 0) {
      report.ok = false;
      report.failure = { kind: "checks", message: errors.slice(0, 20).join("\n") + (errors.length > 20 ? `\n…and ${errors.length - 20} more` : "") };
      return report;
    }

    // --- write (only now) ---
    for (const data of toWrite) writeSeasonData(opts.understatRoot, data);
    for (const p of processed) {
      if (!toWrite.includes(p.data)) {
        // Pairings can be filled in for a stored season without re-downloading it.
        const stored = readSeasonData(opts.understatRoot, p.data.season);
        if (JSON.stringify(stored?.clubs) !== JSON.stringify(p.data.clubs)) writeSeasonData(opts.understatRoot, p.data);
      }
    }
    writeLinks(opts.understatRoot, links);
    ensureOverridesFile(opts.understatRoot);
    const appFiles: AppSeasonFile[] = processed.map((p) => buildAppSeason(p.data, links, p.complete, new Set(p.matchByFixture.values())));
    for (const f of appFiles) writeAppSeason(opts.understatRoot, f);

    const counts = { confirmed: 0, held: 0, disputed: 0 };
    for (const l of links.values()) counts[l.status] += 1;
    const live = appFiles.find((f) => f.season === liveSeason);
    const status: UnderstatStatus = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      liveSeason,
      seasons: appFiles.map((f) => f.season),
      latestMatchDate: live?.latestMatchDate ?? null,
      missingFixtures,
      links: counts,
    };
    const sameAsBefore = previousStatus && JSON.stringify({ ...previousStatus, generatedAt: "" }) === JSON.stringify({ ...status, generatedAt: "" });
    writeStatus(opts.understatRoot, sameAsBefore ? previousStatus! : status);

    // --- what needs the owner ---
    for (const l of links.values()) {
      if (l.status === "disputed") report.attention.push(`Player link disputed (hidden in the app until fixed): ${l.fplName} ↔ ${l.understatName} — ${l.note}.`);
      // Only seasons the app shows (the live one and the 4 a Historic Average covers) — an old-season hold changes nothing on screen.
      const heldSeason = /^(\d{4})\/\d{2}:/.exec(l.note)?.[1];
      const onScreen = heldSeason !== undefined && Number(heldSeason) >= startYear(liveSeason) - 4;
      if (l.status === "held" && onScreen && daysBetween(l.since, opts.today) >= HELD_ALERT_DAYS) {
        report.attention.push(`Player not linked for ${daysBetween(l.since, opts.today)} days (shows "—"): ${l.fplName} — ${l.note}.`);
      }
    }
    const lateIds = Object.entries(missingFixtures).filter(([, since]) => daysBetween(since, opts.today) >= MISSING_ALERT_DAYS);
    if (lateIds.length > 0) {
      report.attention.push(`Understat is behind: ${lateIds.length} FPL fixture${lateIds.length === 1 ? "" : "s"} finished at least ${MISSING_ALERT_DAYS} days ago still missing (FPL fixture ids ${lateIds.map(([id]) => id).join(", ")}).`);
    }
    report.summary.unshift(
      `Seasons in the app: ${appFiles.length} (${appFiles[0]?.season ?? "—"} to ${appFiles.at(-1)?.season ?? "—"}). Live season ${liveSeason}: ${live?.matchesIncluded ?? 0} matches, latest ${live?.latestMatchDate ?? "—"}.`,
      `Player links: ${counts.confirmed} confirmed, ${counts.held} held, ${counts.disputed} disputed. FPL and Understat goals compared in ${compared.toLocaleString("en-GB")} player-matches.`,
      `Understat requests this run: ${opts.client.requestCount()}.`,
    );
    return report;
  } catch (err) {
    report.ok = false;
    const message = err instanceof Error ? err.message : String(err);
    const kind: FailureKind = err instanceof UnderstatBlockedError ? "blocked" : err instanceof UnderstatFormatError ? "format" : "error";
    report.failure = { kind, message: errors.length > 0 ? `${message}\n${errors.join("\n")}` : message };
    return report;
  }
}
