/**
 * Rebuilds what Scoutline's model would have known before every past
 * gameweek, for fitting (fit.ts) and proving (backtest.ts) the Model
 * Predicted points model (client/src/metrics/pointsModel.ts).
 *
 * <as_of_evidence>: every sample is one player in one finished match, with
 * his evidence built only from matches in EARLIER gameweeks (this season so
 * far, plus his completed seasons) and the match's outlook from the Fixture
 * Forecast's club ratings fitted only on earlier matches — exactly what the
 * app would have had before that gameweek's deadline. Nothing from the
 * match itself, or after it, goes in.
 *
 * Sources (owner's decision, 2026-10-25: fitting and proving the model may
 * use every approved source):
 *  - data/club-history/<season>/ — the club records (the app's own ledger:
 *    FPL's data, 2016/17–2025/26 via the vaastav backfill, 2026/27 from the
 *    weekly official archive): minutes, starts, goals, xG… for every player
 *    in every match, and the clubs' matches the Fixture Forecast rates.
 *  - data/vaastav-snapshot/<season>/merged_gw.csv.gz — what the ledger
 *    doesn't carry: cards, penalties saved and missed, and each player's
 *    price at the time (to 2025/26).
 *  - data/understat/ — penalties (who took them, who scored), for the
 *    penalty-evidence variant (separatesPenalties).
 *  - data/fpl-availability/<season>/ — FPL's availability news as it stood
 *    at each deadline, recorded from 2026/27 GW10 on (<availability_record>):
 *    a gameweek with a reading gives each player its chance of playing, as
 *    the app reads it live; one without has none (1, as before).
 *  - The live FPL API, once, for 2026/27's prices, strengths and difficulty
 *    ratings, and each player's transfers before every deadline (vaastav
 *    has them to 2025/26) — cached in .cache/.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { readSeasonLedger, listSeasonFolders, seasonFromFolderName } from "../../../server/src/clubHistory/ledgerFiles";
import { aggregateClubSeason } from "../../../server/src/clubHistory/aggregate";
import { parseCsv } from "../../../server/src/clubHistory/csv";
import type { ClubSeason as ServerClubSeason, LedgerRow } from "../../../server/src/clubHistory/types";
import { fitClubRatings, matchTime } from "../../src/metrics/fixtureForecast";
import { fixtureOutlook, SCORING_RULES, type FixtureOutlook, type PastSeason, type PlayerEvidence, type RecentMatch, type ScoringRules, type SeasonTotals, type TransferWindow } from "../../src/metrics/pointsModel";
import { availabilityModifier } from "../../src/metrics/availability";
import type { ClubSeason, NormalizedPlayer, Position } from "../../src/types/normalized";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../../..");
const CLUB_HISTORY = path.join(ROOT, "data/club-history");
const VAASTAV = path.join(ROOT, "data/vaastav-snapshot");
const UNDERSTAT = path.join(ROOT, "data/understat");
const AVAILABILITY = path.join(ROOT, "data/fpl-availability");
const CACHE = path.join(HERE, ".cache");

export const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];
const POSITION_BY_TYPE: Record<number, Position> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
/** Past seasons a player's evidence reaches back over, as in the app (its last-completed-season window). */
const PAST_SEASONS = 3;

/** FPL's scoring in each season: DC from 2025/26, and a goalkeeper's goal 10 from then (6 before). */
export function rulesForSeason(season: string): ScoringRules {
  if (season >= "2025/26") return SCORING_RULES;
  return { ...SCORING_RULES, goal: { ...SCORING_RULES.goal, GKP: 6 }, defensiveContribution: 0 };
}

export interface Actual {
  minutes: number;
  started: boolean;
  points: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  saves: number;
  dc: number | null;
  bonus: number;
  yellow: number | null;
  red: number | null;
  ownGoals: number;
  penaltiesSaved: number | null;
  penaltiesMissed: number | null;
  xG: number | null;
  xA: number | null;
}

/** What the replaced model (legacyModel.ts) needs for the same match, as the app would have had it. */
export interface LegacyContext {
  totals: { minutes: number; xG: number | null; xA: number | null; xGC: number | null; saves: number; dc: number | null; points: number; matches: number };
  clubPlayed: number;
  difficulty: number | null;
  ownStrength: number | null;
  opponentStrength: number | null;
  past: { season: string; minutes: number; starts: number | null; bonus: number; bps: number; totalPoints: number }[];
}

export interface Sample {
  season: string;
  round: number;
  /** That season's fixture and element ids. */
  fixture: number;
  element: number;
  code: number;
  position: Position;
  club: number;
  opponent: number;
  home: boolean;
  /** FPL-only evidence: what the app has with the optional second source switched off. */
  evidence: PlayerEvidence;
  /** The same with Understat's penalty evidence where he's linked (null where he isn't: the app would fall back to `evidence`). */
  evidenceWithPenalties: PlayerEvidence | null;
  outlook: FixtureOutlook;
  actual: Actual;
  legacy: LegacyContext;
}

// ---------- small readers ----------

function readGzCsv(file: string): Record<string, string>[] {
  return parseCsv(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}
function readCsv(file: string): Record<string, string>[] {
  return parseCsv(fs.readFileSync(file, "utf8"));
}
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

async function cachedJson(name: string, url: string): Promise<unknown> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch(url, { headers: { "User-Agent": "Scoutline model backtest" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const data = await res.json();
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

// ---------- accumulators ----------

interface Accum extends SeasonTotals {
  xGMinutesAcc: number;
  xGC: number | null;
  bps: number;
  totalPoints: number;
  matches: RecentMatch[];
}

function emptyAccum(): Accum {
  return {
    minutes: 0, starts: 0, goals: 0, assists: 0, xG: null, xGMinutesAcc: 0, xA: null, dc: null, saves: 0, bonus: 0,
    yellowCards: null, penaltiesTaken: null, penaltyGoals: null, xGC: null, bps: 0, totalPoints: 0, matches: [],
  };
}

const addNullable = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

function addRow(acc: Accum, r: LedgerRow, extra: Extra | undefined): void {
  acc.minutes += r.minutes;
  acc.starts = r.starts === null || acc.starts === null ? null : acc.starts + r.starts;
  acc.goals += r.goals;
  acc.assists += r.assists;
  if (r.xG !== null) {
    acc.xG = (acc.xG ?? 0) + r.xG;
    acc.xGMinutesAcc += r.minutes;
  }
  acc.xA = addNullable(acc.xA, r.xA);
  acc.xGC = addNullable(acc.xGC, r.xGC);
  acc.dc = addNullable(acc.dc, r.dc);
  acc.saves = (acc.saves ?? 0) + (r.saves ?? 0);
  acc.bonus += r.bonus;
  acc.bps += r.bps ?? 0;
  acc.totalPoints += r.totalPoints;
  acc.yellowCards = extra ? (acc.yellowCards ?? 0) + extra.yellow : acc.yellowCards;
  acc.matches.push({ started: (r.starts ?? (r.minutes >= 60 ? 1 : 0)) > 0, minutes: r.minutes });
}

function totalsOf(acc: Accum): SeasonTotals {
  return {
    minutes: acc.minutes, starts: acc.starts, goals: acc.goals, assists: acc.assists, xG: acc.xG,
    xGMinutes: acc.xG === null ? undefined : acc.xGMinutesAcc, xA: acc.xA, dc: acc.dc, saves: acc.saves, bonus: acc.bonus,
    yellowCards: acc.yellowCards, penaltiesTaken: null, penaltyGoals: null,
  };
}

// ---------- vaastav extras (cards, penalties, price) ----------

interface Extra {
  yellow: number;
  red: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  price: number;
  /** Transfers before this match's deadline, and his owners at it (FPL's `selected`). */
  transfers: TransferWindow;
}

function loadExtras(season: string): Map<string, Extra> | null {
  const file = path.join(VAASTAV, season.replace("/", "-"), "merged_gw.csv.gz");
  if (!fs.existsSync(file)) return null;
  const out = new Map<string, Extra>();
  for (const r of readGzCsv(file)) {
    out.set(`${r.element}:${r.fixture}`, {
      yellow: Number(r.yellow_cards) || 0,
      red: Number(r.red_cards) || 0,
      penaltiesSaved: Number(r.penalties_saved) || 0,
      penaltiesMissed: Number(r.penalties_missed) || 0,
      price: (Number(r.value) || 0) / 10,
      transfers: { in: Number(r.transfers_in) || 0, out: Number(r.transfers_out) || 0, owners: Number(r.selected) || 0 },
    });
  }
  return out;
}

/**
 * The live season's transfers before each deadline, from FPL's
 * element-summaries (`${element}:${fixture}` → window), fetched once per
 * gameweek finished (cached in .cache/).
 */
async function liveTransfers(season: string, elements: number[], lastRound: number): Promise<Map<string, TransferWindow>> {
  const name = `transfers-${season.replace("/", "-")}-gw${lastRound}.json`;
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  let byElement: Record<string, { fixture: number; transfers_in: number; transfers_out: number; selected: number }[]>;
  if (fs.existsSync(file)) {
    byElement = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    byElement = {};
    const queue = [...elements];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(`https://fantasy.premierleague.com/api/element-summary/${id}/`, { headers: { "User-Agent": "Scoutline model backtest" } });
          if (res.ok) {
            byElement[id] = ((await res.json()) as { history: { fixture: number; transfers_in: number; transfers_out: number; selected: number }[] }).history.map((h) => ({ fixture: h.fixture, transfers_in: h.transfers_in, transfers_out: h.transfers_out, selected: h.selected }));
            break;
          }
          // A player since removed from the game: no transfers on record.
          if (res.status === 404) {
            byElement[id] = [];
            break;
          }
          if (attempt >= 3) throw new Error(`element-summary ${id} -> HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    fs.writeFileSync(file, JSON.stringify(byElement));
  }
  const out = new Map<string, TransferWindow>();
  for (const [id, rows] of Object.entries(byElement)) for (const h of rows) out.set(`${id}:${h.fixture}`, { in: h.transfers_in, out: h.transfers_out, owners: h.selected });
  return out;
}

/**
 * <availability_record>: each gameweek's recorded FPL availability (data/
 * fpl-availability/, scripts/fpl-availability/record.ts) as the app would
 * have read it before that deadline (availabilityModifier), by player code.
 * A player missing from a reading was available with no news. Rounds with
 * no reading aren't in the map.
 */
function recordedAvailability(season: string): Map<number, Map<number, number>> {
  const dir = path.join(AVAILABILITY, season.replace("/", "-"));
  const out = new Map<number, Map<number, number>>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = /^gw(\d+)\.json$/.exec(f);
    if (!m) continue;
    const reading = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { players: { code: number; status: string; chanceNextRound: number | null }[] };
    const byCode = new Map<number, number>();
    for (const p of reading.players) {
      const a = availabilityModifier({ status: p.status, chanceOfPlayingNextRound: p.chanceNextRound } as NormalizedPlayer);
      if (a !== null) byCode.set(p.code, a);
    }
    out.set(Number(m[1]), byCode);
  }
  return out;
}

/** Difficulty ratings and team strengths for the replaced model: vaastav's (to 2025/26) or the live API's (2026/27). */
interface SeasonFplMeta {
  difficulty: Map<string, number>; // `${fixture}:${home ? "h" : "a"}`
  strengthByTeamId: Map<number, { home: number; away: number }>;
  priceByElement: Map<number, number>;
}

async function loadFplMeta(season: string, live: boolean): Promise<SeasonFplMeta> {
  const difficulty = new Map<string, number>();
  const strengthByTeamId = new Map<number, { home: number; away: number }>();
  const priceByElement = new Map<number, number>();
  if (live) {
    const boot = (await cachedJson("bootstrap-static.json", "https://fantasy.premierleague.com/api/bootstrap-static/")) as {
      teams: { id: number; strength_overall_home: number; strength_overall_away: number }[];
      elements: { id: number; now_cost: number }[];
    };
    const fixtures = (await cachedJson("fixtures.json", "https://fantasy.premierleague.com/api/fixtures/")) as { id: number; team_h_difficulty: number; team_a_difficulty: number }[];
    for (const t of boot.teams) strengthByTeamId.set(t.id, { home: t.strength_overall_home, away: t.strength_overall_away });
    for (const e of boot.elements) priceByElement.set(e.id, e.now_cost / 10);
    for (const f of fixtures) {
      difficulty.set(`${f.id}:h`, f.team_h_difficulty);
      difficulty.set(`${f.id}:a`, f.team_a_difficulty);
    }
    return { difficulty, strengthByTeamId, priceByElement };
  }
  const dir = path.join(VAASTAV, season.replace("/", "-"));
  if (fs.existsSync(path.join(dir, "fixtures.csv.gz"))) {
    for (const f of readGzCsv(path.join(dir, "fixtures.csv.gz"))) {
      difficulty.set(`${f.id}:h`, Number(f.team_h_difficulty));
      difficulty.set(`${f.id}:a`, Number(f.team_a_difficulty));
    }
  }
  if (fs.existsSync(path.join(dir, "teams.csv.gz"))) {
    // Past seasons' overall ratings are on a different scale (~1000–1400); the 1–5 `strength` is the one comparable with today's.
    for (const t of readGzCsv(path.join(dir, "teams.csv.gz"))) strengthByTeamId.set(Number(t.id), { home: Number(t.strength), away: Number(t.strength) });
  }
  for (const p of readGzCsv(path.join(dir, "players_raw.csv.gz"))) priceByElement.set(Number(p.id), Number(p.now_cost) / 10);
  return { difficulty, strengthByTeamId, priceByElement };
}

// ---------- Understat penalties ----------

interface PenaltyEvent {
  round: number;
  club: number;
  understatPlayer: string;
  scored: boolean;
}

function loadPenalties(season: string, codeByTeamId: Map<number, number>, fixtures: { id: number; event: number | null; teamH: number; teamA: number }[]): PenaltyEvent[] {
  const dir = path.join(UNDERSTAT, "seasons", season.replace("/", "-"));
  if (!fs.existsSync(path.join(dir, "shots.csv"))) return [];
  const fplCodeByUs = new Map(readCsv(path.join(dir, "clubs.csv")).map((c) => [c.understat_team_id, Number(c.fpl_team_code)]));
  const roundByPair = new Map<string, number>();
  for (const f of fixtures) {
    const h = codeByTeamId.get(f.teamH);
    const a = codeByTeamId.get(f.teamA);
    if (h !== undefined && a !== undefined && f.event !== null) roundByPair.set(`${h}:${a}`, f.event);
  }
  const matchInfo = new Map<string, { round: number; home: number; away: number }>();
  for (const m of readCsv(path.join(dir, "matches.csv"))) {
    const h = fplCodeByUs.get(m.home_team_id);
    const a = fplCodeByUs.get(m.away_team_id);
    if (h === undefined || a === undefined) continue;
    const round = roundByPair.get(`${h}:${a}`);
    if (round !== undefined) matchInfo.set(m.match_id, { round, home: h, away: a });
  }
  const out: PenaltyEvent[] = [];
  for (const s of readCsv(path.join(dir, "shots.csv"))) {
    if (s.situation !== "Penalty") continue;
    const info = matchInfo.get(s.match_id);
    if (!info) continue;
    out.push({ round: info.round, club: s.side === "h" ? info.home : info.away, understatPlayer: s.player_id, scored: s.result === "Goal" });
  }
  return out;
}

// ---------- the walk ----------

function seasonTotalsCopy(acc: Accum, seasonsAgo: number): PastSeason {
  return { ...totalsOf(acc), seasonsAgo };
}

/**
 * Every finished match from `fromSeason` on, as a Sample (see
 * <as_of_evidence>). Seasons before it are walked too, for the past
 * seasons and the club ratings they feed.
 */
export async function buildSamples(fromSeason = "2022/23"): Promise<{ samples: Sample[]; clubSeasons: ClubSeason[] }> {
  const seasons = listSeasonFolders(CLUB_HISTORY).map(seasonFromFolderName);
  const ledgers = seasons.map((s) => readSeasonLedger(CLUB_HISTORY, s)!);
  const clubSeasons = ledgers.flatMap((l) => aggregateClubSeason(l.season, l.teams, l.fixtures, l.rows)) as unknown as ClubSeason[] & ServerClubSeason[];
  const seasonIndex = new Map([...new Set(clubSeasons.map((c) => c.season))].sort().map((s, i) => [s, i]));
  const liveSeason = seasons[seasons.length - 1];

  const usLinks = new Map(readCsv(path.join(UNDERSTAT, "links.csv")).map((l) => [l.understat_id, Number(l.fpl_code)]));
  const usByCode = new Map([...usLinks].map(([us, code]) => [code, us]));

  const pastByCode = new Map<number, { season: string; acc: Accum; penalties: { taken: number; goals: number } }[]>();
  const samples: Sample[] = [];
  let previousSeasonPenalties: PenaltyEvent[] = [];

  for (const ledger of ledgers) {
    const season = ledger.season;
    const sampling = season >= fromSeason;
    const codeByTeamId = new Map(ledger.teams.map((t) => [t.id, t.code]));
    const extras = loadExtras(season);
    const meta = sampling ? await loadFplMeta(season, season === liveSeason && !extras) : null;
    const penalties = loadPenalties(season, codeByTeamId, ledger.fixtures);
    const fixtureById = new Map(ledger.fixtures.map((f) => [f.id, f]));
    const finishedRounds = ledger.rows.filter((r) => r.round !== null && fixtureById.get(r.fixture)?.finished).map((r) => r.round!);
    const transfersOf =
      sampling && !extras
        ? await liveTransfers(season, [...new Set(ledger.rows.map((r) => r.element))], Math.max(0, ...finishedRounds))
        : null;
    const availabilityByRound = recordedAvailability(season);

    const current = new Map<number, Accum>();
    const penaltiesSoFar = new Map<number, { taken: number; goals: number }>(); // by FPL code (linked players)
    const lastPrice = new Map<number, number>();
    const clubPlayed = new Map<number, number>();

    const rounds = [...new Set(ledger.rows.map((r) => r.round).filter((r): r is number => r !== null))].sort((a, b) => a - b);
    for (const round of rounds) {
      const rows = ledger.rows.filter((r) => r.round === round && fixtureById.get(r.fixture)?.finished);
      if (sampling) {
        const ratings = fitClubRatings(clubSeasons, matchTime(seasonIndex.get(season)!, round), season);
        // The penalty taker as of now: whoever took most of his club's penalties this season so far and last season (counted half).
        const penaltyCounts = new Map<number, Map<string, number>>();
        const countPenalty = (e: PenaltyEvent, w: number) => {
          const byPlayer = penaltyCounts.get(e.club) ?? new Map<string, number>();
          byPlayer.set(e.understatPlayer, (byPlayer.get(e.understatPlayer) ?? 0) + w);
          penaltyCounts.set(e.club, byPlayer);
        };
        for (const e of previousSeasonPenalties) countPenalty(e, 0.5);
        for (const e of penalties) if (e.round < round) countPenalty(e, 1);
        const takerByClub = new Map([...penaltyCounts].map(([club, m]) => [club, [...m].sort((a, b) => b[1] - a[1])[0][0]]));

        for (const r of rows) {
          const position = r.position !== null ? POSITION_BY_TYPE[r.position] : undefined;
          const club = codeByTeamId.get(r.team);
          const f = fixtureById.get(r.fixture)!;
          const opponent = codeByTeamId.get(r.wasHome ? f.teamA : f.teamH);
          if (!position || club === undefined || opponent === undefined) continue;
          const outlook = fixtureOutlook(ratings, club, opponent, r.wasHome);
          if (!outlook) continue;
          const extra = extras?.get(`${r.element}:${r.fixture}`);
          const price = extra?.price ?? lastPrice.get(r.code) ?? meta!.priceByElement.get(r.element) ?? 5;
          const acc = current.get(r.code);
          const seasonsAgo = (s: string) => seasons.indexOf(season) - seasons.indexOf(s);
          const pastList = (pastByCode.get(r.code) ?? []).filter((p) => seasonsAgo(p.season) >= 1 && seasonsAgo(p.season) <= PAST_SEASONS);
          const past: PastSeason[] = pastList.map((p) => seasonTotalsCopy(p.acc, seasonsAgo(p.season))).filter((p) => p.minutes > 0);
          const evidence: PlayerEvidence = {
            position,
            price,
            current: acc && acc.matches.length > 0 ? totalsOf(acc) : null,
            matches: acc ? [...acc.matches] : [],
            past,
            penaltyTaker: null,
            availability: availabilityByRound.has(round) ? (availabilityByRound.get(round)!.get(r.code) ?? 1) : 1,
            transfers: extra?.transfers ?? transfersOf?.get(`${r.element}:${r.fixture}`) ?? null,
          };
          const us = usByCode.get(r.code);
          let evidenceWithPenalties: PlayerEvidence | null = null;
          if (us !== undefined) {
            const soFar = penaltiesSoFar.get(r.code) ?? { taken: 0, goals: 0 };
            const pastPens = pastList.filter((p) => p.acc.minutes > 0).map((p) => p.penalties);
            evidenceWithPenalties = {
              ...evidence,
              current: evidence.current ? { ...evidence.current, penaltiesTaken: soFar.taken, penaltyGoals: soFar.goals } : null,
              past: evidence.past.map((p, i) => ({ ...p, penaltiesTaken: pastPens[i]?.taken ?? 0, penaltyGoals: pastPens[i]?.goals ?? 0 })),
              penaltyTaker: takerByClub.get(club) === us,
            };
          }
          const pastHistory = pastList.map((p) => ({ season: p.season, minutes: p.acc.minutes, starts: p.acc.starts, bonus: p.acc.bonus, bps: p.acc.bps, totalPoints: p.acc.totalPoints }));
          const strength = meta!.strengthByTeamId;
          const oppTeamId = r.wasHome ? f.teamA : f.teamH;
          samples.push({
            season,
            round,
            fixture: r.fixture,
            element: r.element,
            code: r.code,
            position,
            club,
            opponent,
            home: r.wasHome,
            evidence,
            evidenceWithPenalties,
            outlook,
            actual: {
              minutes: r.minutes,
              started: (r.starts ?? (r.minutes >= 60 ? 1 : 0)) > 0,
              points: r.totalPoints,
              goals: r.goals,
              assists: r.assists,
              cleanSheet: r.cleanSheets > 0,
              goalsConceded: r.goalsConceded ?? 0,
              saves: r.saves ?? 0,
              dc: r.dc,
              bonus: r.bonus,
              yellow: extra?.yellow ?? null,
              red: extra?.red ?? null,
              ownGoals: r.ownGoals ?? 0,
              penaltiesSaved: extra?.penaltiesSaved ?? null,
              penaltiesMissed: extra?.penaltiesMissed ?? null,
              xG: r.xG,
              xA: r.xA,
            },
            legacy: {
              totals: acc
                ? { minutes: acc.minutes, xG: acc.xG, xA: acc.xA, xGC: acc.xGC, saves: acc.saves ?? 0, dc: acc.dc, points: acc.totalPoints, matches: acc.matches.length }
                : { minutes: 0, xG: null, xA: null, xGC: null, saves: 0, dc: null, points: 0, matches: 0 },
              clubPlayed: clubPlayed.get(club) ?? 0,
              difficulty: meta!.difficulty.get(`${r.fixture}:${r.wasHome ? "h" : "a"}`) ?? null,
              ownStrength: (r.wasHome ? strength.get(r.team)?.home : strength.get(r.team)?.away) ?? null,
              opponentStrength: (r.wasHome ? strength.get(oppTeamId)?.away : strength.get(oppTeamId)?.home) ?? null,
              past: pastHistory,
            },
          });
        }
      }
      // Then this round joins what's known.
      for (const r of rows) {
        const extra = extras?.get(`${r.element}:${r.fixture}`);
        if (extra) lastPrice.set(r.code, extra.price);
        const acc = current.get(r.code) ?? emptyAccum();
        addRow(acc, r, extra);
        current.set(r.code, acc);
      }
      for (const fx of new Set(rows.map((r) => r.fixture))) {
        const f = fixtureById.get(fx)!;
        for (const t of [f.teamH, f.teamA]) {
          const c = codeByTeamId.get(t);
          if (c !== undefined) clubPlayed.set(c, (clubPlayed.get(c) ?? 0) + 1);
        }
      }
      for (const e of penalties) {
        if (e.round !== round) continue;
        const code = usLinks.get(e.understatPlayer);
        if (code === undefined) continue;
        const p = penaltiesSoFar.get(code) ?? { taken: 0, goals: 0 };
        p.taken += 1;
        p.goals += e.scored ? 1 : 0;
        penaltiesSoFar.set(code, p);
      }
    }

    for (const [code, acc] of current) {
      const list = pastByCode.get(code) ?? [];
      list.push({ season, acc, penalties: penaltiesSoFar.get(code) ?? { taken: 0, goals: 0 } });
      pastByCode.set(code, list);
    }
    previousSeasonPenalties = penalties;
  }
  return { samples, clubSeasons };
}
