/**
 * Backtests Expected Points Tier 2 (metrics/expectedPointsV2.ts) against
 * real results from every completed gameweek so far this season, and
 * reports it alongside the one part of the existing Tier 1 model that
 * CAN be faithfully reconstructed for a past gameweek.
 *
 * <ep_next_cannot_be_backtested>: Tier 1's headline figure
 * (computeExpectedPointsForWindow) is built on FPL's own `ep_next` —
 * a live, continuously-updated "current best guess for the next
 * fixture" with no historical record anywhere. There is no way to ask
 * the FPL API "what was ep_next before gameweek 2" after the fact, so a
 * true head-to-head backtest of Tier 1's actual headline number against
 * Tier 2 is not possible with data that exists. What CAN be faithfully
 * backtested is Tier 1's OTHER two inputs — lastSeason and
 * historicAverage, both pure prior-season rate extrapolations that
 * never depend on the live season at all, so they're identical whether
 * computed today or reconstructed for gameweek 2. That combination
 * (computeExpPointsBreakdown's overallAverage, with fplPredicted forced
 * null) is what this script calls the "Tier 1 baseline" — a genuinely
 * fair comparison, just not the same number a user sees on the
 * Team Building page today (that page's Overall Average also blends in
 * live ep_next, which this script cannot reconstruct for a past week).
 *
 * Run with: npx tsx client/scripts/backtestExpectedPoints.ts
 * (from the repo root — tsx is already a devDependency via server/).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTeams } from "../src/normalize/normalizeTeams";
import { normalizeFixtures } from "../src/normalize/normalizeFixtures";
import { normalizeElementSummary, normalizeSeasonHistory } from "../src/normalize/normalizeElementSummary";
import { normalizeEvents } from "../src/normalize/gameweek";
import { validate, bootstrapStaticSchema, fixturesSchema, elementSummarySchema } from "../src/validation/schema";
import { determineReferenceSeason, buildHistoricPlayerProfile } from "../src/metrics/historicAnalysis";
import { computeExpPointsBreakdown } from "../src/metrics/expectedPoints";
import { computeExpectedPointsV2ForFixture } from "../src/metrics/expectedPointsV2";
import type { NormalizedPlayer, PlayerGameweekHistory, Position } from "../src/types/normalized";
import type { UpcomingFixture } from "../src/metrics/fixtureTicker";
import type { RawBootstrapStatic, RawFixture, RawElementSummary } from "../src/types/raw";

const API_BASE = "https://fantasy.premierleague.com/api";
/** Per position, how many of the highest-minutes players to sample — a bounded, documented sample (not all ~650 players), chosen to keep this script's runtime and load on FPL's public API reasonable while still covering a meaningful, position-balanced cross-section. */
const SAMPLE_PER_POSITION = 20;
const FETCH_BATCH_SIZE = 10;
const FETCH_BATCH_DELAY_MS = 300;

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "User-Agent": "Mozilla/5.0 (FPL Analytics Dashboard backtest script)" } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mae(errors: number[]): number | null {
  return mean(errors.map((e) => Math.abs(e)));
}

interface BacktestRow {
  playerId: number;
  playerName: string;
  position: Position;
  ownership: number | null;
  round: number;
  actual: number;
  tier1Baseline: number | null;
  tier2: number;
}

async function main() {
  console.log("Fetching bootstrap-static and fixtures...");
  // Same `as unknown as Raw*` cast the app's own api/client.ts uses after
  // validate() — zod's inferred input-side object type doesn't structurally
  // match the hand-written Raw* interfaces (optional fields differ from
  // zod's own pre-default input shape), so the app already works around
  // this at every real call site rather than it being specific to this script.
  const rawBootstrap = validate(bootstrapStaticSchema, await fetchJson("/bootstrap-static/"), "bootstrap-static") as unknown as RawBootstrapStatic;
  const rawFixtures = validate(fixturesSchema, await fetchJson("/fixtures/"), "fixtures") as unknown as RawFixture[];

  const teams = normalizeTeams(rawBootstrap.teams);
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const fixtures = normalizeFixtures(rawFixtures);
  const events = normalizeEvents(rawBootstrap.events);
  const completedEvents = events.filter((e) => e.finished).sort((a, b) => a.id - b.id);

  console.log(`Completed gameweeks so far: ${completedEvents.map((e) => e.id).join(", ") || "(none)"}`);
  if (completedEvents.length < 2) {
    console.log("Fewer than 2 completed gameweeks — nothing to backtest yet (need at least one prior gameweek of history to predict from). Exiting.");
    return;
  }

  // Sample: the highest-minutes players per position, currently. A
  // simple, honest, documented selection — not every player who's
  // featured, and not a random sample, so results skew toward players
  // who've actually played enough to have a real per-90 rate; see the
  // caveat about this in the printed report.
  const byPosition = new Map<Position, typeof rawBootstrap.elements>();
  for (const el of rawBootstrap.elements) {
    const posMap: Record<number, Position> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
    const pos = posMap[el.element_type];
    if (!pos) continue;
    if (!byPosition.has(pos)) byPosition.set(pos, []);
    byPosition.get(pos)!.push(el);
  }
  const sampledIds: { id: number; position: Position; name: string; ownership: number | null }[] = [];
  for (const [pos, elements] of byPosition) {
    const top = elements
      .slice()
      .sort((a, b) => b.minutes - a.minutes)
      .filter((e) => e.minutes > 0)
      .slice(0, SAMPLE_PER_POSITION);
    for (const el of top) sampledIds.push({ id: el.id, position: pos, name: el.web_name, ownership: Number.parseFloat(el.selected_by_percent) || null });
  }
  console.log(`Sampled ${sampledIds.length} players (${SAMPLE_PER_POSITION} highest-minutes per position).`);

  // Fetch element-summary (gameweek history + prior seasons) for every
  // sampled player, in small batches so this doesn't hammer a public API.
  const historyByPlayer = new Map<number, PlayerGameweekHistory[]>();
  const seasonsByPlayer = new Map<number, ReturnType<typeof normalizeSeasonHistory>>();
  for (let i = 0; i < sampledIds.length; i += FETCH_BATCH_SIZE) {
    const batch = sampledIds.slice(i, i + FETCH_BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ id }) => {
        const raw = validate(elementSummarySchema, await fetchJson(`/element-summary/${id}/`), `element-summary/${id}`) as unknown as RawElementSummary;
        historyByPlayer.set(id, normalizeElementSummary(raw));
        seasonsByPlayer.set(id, normalizeSeasonHistory(raw));
      }),
    );
    console.log(`Fetched element-summary for ${Math.min(i + FETCH_BATCH_SIZE, sampledIds.length)}/${sampledIds.length} players...`);
    if (i + FETCH_BATCH_SIZE < sampledIds.length) await new Promise((r) => setTimeout(r, FETCH_BATCH_DELAY_MS));
  }

  const referenceSeasonName = determineReferenceSeason(seasonsByPlayer);
  console.log(`Reference ("last completed") season: ${referenceSeasonName ?? "(none found)"}`);

  const rows: BacktestRow[] = [];

  for (const { id, position, name, ownership } of sampledIds) {
    const history = (historyByPlayer.get(id) ?? []).slice().sort((a, b) => a.round - b.round);
    const seasons = seasonsByPlayer.get(id) ?? [];
    const historicProfile = buildHistoricPlayerProfile(seasons, referenceSeasonName);
    const team = teamsById.get(rawBootstrap.elements.find((e) => e.id === id)!.team);

    // Tier 1 baseline is time-invariant (pure prior-season rates) — computed
    // once per player, valid for every backtest gameweek. Empty fixtures
    // list forces fplPredicted to null (the unreconstructable part);
    // overallAverage then becomes the mean of only lastSeason/historicAverage.
    const fakePlayerForBaseline: NormalizedPlayer = {
      id,
      name,
      firstName: name,
      lastName: name,
      teamId: team?.id ?? 0,
      teamName: team?.name ?? "",
      teamShortName: team?.shortName ?? "",
      position,
      price: 0,
      ownership: null,
      totalPoints: null,
      pointsPerGame: null,
      epNext: null,
      minutes: null,
      starts: null,
      goals: null,
      assists: null,
      cleanSheets: null,
      bonus: null,
      bps: null,
      ictIndex: null,
      saves: null,
      savesPer90: null,
      xG: null,
      xA: null,
      xGI: null,
      xGC: null,
      xGPer90: null,
      xAPer90: null,
      xGIPer90: null,
      xGCPer90: null,
      defensiveContributions: null,
      defensiveContributionsPer90: null,
      status: "a",
      news: "",
      chanceOfPlayingNextRound: null,
      form: null,
      transfersInEvent: null,
      transfersOutEvent: null,
      transfersInTotal: null,
      transfersOutTotal: null,
      costChangeEvent: null,
      costChangeStart: null,
      priceChange: null,
    };
    const baselineBreakdown = computeExpPointsBreakdown(fakePlayerForBaseline, [], 1, historicProfile, true);
    const tier1Baseline = baselineBreakdown.overallAverage;

    for (const targetEvent of completedEvents.slice(1)) {
      const round = targetEvent.id;
      const priorRounds = history.filter((h) => h.round < round);
      const cumulativeMinutes = priorRounds.reduce((s, h) => s + h.minutes, 0);
      if (cumulativeMinutes === 0) continue; // no prior data at all for this player at this point — nothing to predict from

      const actualEntry = history.find((h) => h.round === round);
      if (!actualEntry) continue; // player had no recorded involvement that gameweek (didn't feature) — excluded, not treated as a 0 prediction target

      const per90 = (total: number) => (total / cumulativeMinutes) * 90;
      const xGValues = priorRounds.map((h) => h.xG).filter((v): v is number => v !== null);
      const xAValues = priorRounds.map((h) => h.xA).filter((v): v is number => v !== null);
      const xGCValues = priorRounds.map((h) => h.xGC).filter((v): v is number => v !== null);

      const reliabilityAsOfRound = Math.max(0, Math.min(1, cumulativeMinutes / ((round - 1) * 90)));

      const asOfPlayer: NormalizedPlayer = {
        ...fakePlayerForBaseline,
        xGPer90: xGValues.length > 0 ? per90(xGValues.reduce((a, b) => a + b, 0)) : null,
        xAPer90: xAValues.length > 0 ? per90(xAValues.reduce((a, b) => a + b, 0)) : null,
        xGCPer90: xGCValues.length > 0 ? per90(xGCValues.reduce((a, b) => a + b, 0)) : null,
        defensiveContributionsPer90: per90(priorRounds.reduce((s, h) => s + h.defensiveContribution, 0)),
        savesPer90: per90(priorRounds.reduce((s, h) => s + h.saves, 0)),
      };

      // Reconstruct the real fixture this player actually had for `round`
      // (opponent + home/away are known facts, not outcomes) to look up
      // its real FDR rating — PlayerGameweekHistory doesn't carry a
      // fixture id directly, so match on round + both team ids instead.
      const realFixture = fixtures.find(
        (f) =>
          f.eventId === round &&
          ((actualEntry.wasHome && f.homeTeamId === (team?.id ?? -1) && f.awayTeamId === actualEntry.opponentTeamId) ||
            (!actualEntry.wasHome && f.awayTeamId === (team?.id ?? -1) && f.homeTeamId === actualEntry.opponentTeamId)),
      );
      if (!realFixture) continue; // couldn't confidently reconstruct which fixture this was (e.g. a rearranged/postponed round) — skip rather than guess

      const upcomingFixture: UpcomingFixture = {
        fixtureId: realFixture.id,
        opponentTeamId: actualEntry.opponentTeamId,
        opponentShortName: teamsById.get(actualEntry.opponentTeamId)?.shortName ?? "???",
        isHome: actualEntry.wasHome,
        difficulty: actualEntry.wasHome ? realFixture.homeDifficulty : realFixture.awayDifficulty,
      };

      const opponentTeam = teamsById.get(actualEntry.opponentTeamId);
      const tier2Breakdown = computeExpectedPointsV2ForFixture(asOfPlayer, upcomingFixture, team, opponentTeam, reliabilityAsOfRound, historicProfile);

      rows.push({
        playerId: id,
        playerName: name,
        position,
        ownership,
        round,
        actual: actualEntry.totalPoints,
        tier1Baseline,
        tier2: tier2Breakdown.total,
      });
    }
  }

  console.log(`\nBacktest points collected: ${rows.length}\n`);
  report(rows);
}

function report(rows: BacktestRow[]) {
  const tier2Errors = rows.map((r) => r.tier2 - r.actual);
  const tier1Rows = rows.filter((r) => r.tier1Baseline !== null);
  const tier1Errors = tier1Rows.map((r) => r.tier1Baseline! - r.actual);

  console.log("=== Overall ===");
  console.log(`Tier 2  — n=${rows.length}, MAE=${mae(tier2Errors)?.toFixed(2)}, mean signed error=${mean(tier2Errors)?.toFixed(2)} (positive = over-predicts)`);
  console.log(
    `Tier 1 baseline (historic-rate only; excludes unreconstructable live ep_next) — n=${tier1Rows.length}, MAE=${mae(tier1Errors)?.toFixed(2)}, mean signed error=${mean(tier1Errors)?.toFixed(2)}`,
  );
  if (tier1Rows.length !== rows.length) {
    console.log(
      `Note: Tier 1 baseline has fewer rows than Tier 2 (${tier1Rows.length} vs ${rows.length}) — some sampled players have no qualifying prior-season data (e.g. promoted-club or recently-established players), so Tier 1's baseline is null for them while Tier 2 still produces an estimate (with a caveat) from live per-90 rates alone. Not a like-for-like n; the by-position and per-model MAEs above are each computed only over the rows each model actually has.`,
    );
  }

  console.log("\n=== By position ===");
  for (const pos of ["GKP", "DEF", "MID", "FWD"] as Position[]) {
    const posRows = rows.filter((r) => r.position === pos);
    const posTier1 = posRows.filter((r) => r.tier1Baseline !== null);
    console.log(
      `${pos}: n=${posRows.length}  Tier2 MAE=${mae(posRows.map((r) => r.tier2 - r.actual))?.toFixed(2) ?? "—"}  Tier1baseline MAE=${mae(posTier1.map((r) => r.tier1Baseline! - r.actual))?.toFixed(2) ?? "—"}`,
    );
  }

  // "Nailed-on vs differential" split by current ownership% (FPL's own
  // usual meaning of the term), not by backtest appearance count — with
  // only 2 backtestable gameweeks so far this season, an appearance-count
  // split has almost no spread to split on and produces a meaningless
  // lopsided result.
  console.log("\n=== High-ownership ('nailed-on') vs low-ownership ('differential') split ===");
  const OWNERSHIP_NAILED_ON_THRESHOLD_PCT = 15;
  const ownedRows = rows.filter((r) => r.ownership !== null && r.ownership >= OWNERSHIP_NAILED_ON_THRESHOLD_PCT);
  const diffRows = rows.filter((r) => r.ownership !== null && r.ownership < OWNERSHIP_NAILED_ON_THRESHOLD_PCT);
  console.log(`High ownership (≥${OWNERSHIP_NAILED_ON_THRESHOLD_PCT}%, n=${ownedRows.length}): Tier2 MAE=${mae(ownedRows.map((r) => r.tier2 - r.actual))?.toFixed(2) ?? "—"}`);
  console.log(`Low ownership / differential (n=${diffRows.length}): Tier2 MAE=${mae(diffRows.map((r) => r.tier2 - r.actual))?.toFixed(2) ?? "—"}`);

  const csvLines = ["playerId,playerName,position,ownership,round,actual,tier1Baseline,tier2"];
  for (const r of rows) {
    csvLines.push(`${r.playerId},"${r.playerName}",${r.position},${r.ownership ?? ""},${r.round},${r.actual},${r.tier1Baseline ?? ""},${r.tier2.toFixed(3)}`);
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(__dirname, "backtest-results.csv");
  fs.writeFileSync(outPath, csvLines.join("\n"));
  console.log(`\nFull row-level CSV written to ${outPath}`);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
