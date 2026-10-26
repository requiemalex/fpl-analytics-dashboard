/**
 * Keeps saved player and club ids pointing at the same players and clubs
 * when FPL renumbers them for a new season (audit 2026-10-18 M6).
 *
 * FPL's `id`s are per season: every summer id 430 can become a different
 * player and team id 14 a different club. Saved squads, tracked-player and
 * tracked-club tiles and graphs (and the saved views that embed them) store
 * those ids, so after the reset they would silently show someone else.
 * FPL's `code` is the permanent identity, so the ledger below records, for
 * the season the saved ids belong to, every id's code. When the app first
 * loads a new season, each saved id is translated old id -> code -> new id,
 * in every store at once:
 *  - a player or club no longer in FPL is dropped from lists; a squad's
 *    armband on such a player is cleared;
 *  - a squad's purchase prices (<purchase_prices>) are dropped: they were
 *    paid at last season's prices, which FPL resets for the new one;
 *  - a tile or graph filtered to a club no longer in FPL falls back to all
 *    clubs, and its name says so, so the change is visible, not silent;
 *  - a tile or graph whose tracked players (or clubs) have all left keeps
 *    an empty list, which shows no one rather than the whole league, and
 *    its name says so (audit 2026-10-18 R2).
 *
 * The ledger is its own store; the stores it rewrites keep their shape and
 * their version (nothing about what they hold changes, only which ids).
 */
import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const LEDGER_KEY = "fpl-dashboard:id-ledger:v1";
const LEDGER_VERSION = 1;

interface IdLedger {
  season: string;
  /** id -> permanent code, for the season above. */
  playerCodes: Record<string, number>;
  teamCodes: Record<string, number>;
}

const LEDGER_STORE: VersionedStore<IdLedger | null> = {
  version: LEDGER_VERSION,
  fallback: null,
  migrate(data) {
    if (!data || typeof data !== "object") return null;
    const d = data as Partial<IdLedger>;
    if (typeof d.season !== "string" || !d.playerCodes || typeof d.playerCodes !== "object" || !d.teamCodes || typeof d.teamCodes !== "object") return null;
    return { season: d.season, playerCodes: d.playerCodes, teamCodes: d.teamCodes };
  },
};

/** The stores holding FPL player or club ids. */
export const ID_STORE_KEYS = {
  summaryTiles: "fpl-dashboard:dashboard:summary-tiles:v1",
  dashboardGraphs: "fpl-dashboard:dashboard:graphs:v1",
  savedViews: "fpl-dashboard:dashboard:saved-views:v1",
  savedSquads: "fpl-dashboard:saved-squads:v1",
} as const;

/** "2026/27" from gameweek 1's deadline, as the server works it out. Null if events are missing. */
export function liveSeasonName(events: { id: number; deadline_time: string }[]): string | null {
  const first = events.find((e) => e.id === 1) ?? events[0];
  if (!first) return null;
  const year = new Date(first.deadline_time).getUTCFullYear();
  return Number.isFinite(year) ? `${year}/${String((year + 1) % 100).padStart(2, "0")}` : null;
}

export interface RolloverResult {
  /** True when saved ids were translated from an earlier season this call. */
  rolledOver: boolean;
  fromSeason: string | null;
  droppedPlayers: number;
  droppedClubs: number;
}

type Translate = (id: number) => number | null;

const CLUB_GONE_SUFFIX = " (club no longer in FPL)";
const PLAYERS_GONE_SUFFIX = " (players no longer in FPL)";
const CLUBS_GONE_SUFFIX = " (clubs no longer in FPL)";

function withSuffix(item: Record<string, unknown>, suffix: string): void {
  const name = typeof item.name === "string" && item.name.trim() !== "" ? item.name : null;
  item.name = `${name ?? "Tile"}${suffix}`;
}

/** A tracked list that had ids and has none left after translating. */
const emptiedByRollover = (before: unknown, after: unknown) => Array.isArray(before) && before.length > 0 && Array.isArray(after) && after.length === 0;

function remapList(list: unknown, translate: Translate, dropped: { n: number }): unknown {
  if (!Array.isArray(list)) return list;
  const out: number[] = [];
  for (const id of list) {
    if (typeof id !== "number") continue;
    const next = translate(id);
    if (next === null) dropped.n += 1;
    else if (!out.includes(next)) out.push(next);
  }
  return out;
}

/** A tile or a graph: tracked players, tracked clubs, and a club filter. */
function remapTileOrGraph(raw: unknown, player: Translate, team: Translate, counts: { players: { n: number }; clubs: { n: number } }): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const item = { ...(raw as Record<string, unknown>) };
  // A tracked list whose every player or club has left stays an empty list,
  // which the Dashboard shows as tracking no one, never as the whole league,
  // and the name says why (audit 2026-10-18 R2).
  const playerIds = remapList(item.playerIds, player, counts.players);
  if (emptiedByRollover(item.playerIds, playerIds)) withSuffix(item, PLAYERS_GONE_SUFFIX);
  item.playerIds = playerIds;
  const teamIds = remapList(item.teamIds, team, counts.clubs);
  if (emptiedByRollover(item.teamIds, teamIds)) withSuffix(item, CLUBS_GONE_SUFFIX);
  item.teamIds = teamIds;
  const criteria = item.criteria as Record<string, unknown> | null | undefined;
  if (criteria && typeof criteria === "object" && typeof criteria.teamId === "number") {
    const next = team(criteria.teamId);
    if (next === null) {
      counts.clubs.n += 1;
      item.criteria = { ...criteria, teamId: "ALL" };
      withSuffix(item, CLUB_GONE_SUFFIX);
    } else {
      item.criteria = { ...criteria, teamId: next };
    }
  }
  return item;
}

function remapSquad(raw: unknown, player: Translate, counts: { players: { n: number } }): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const squad = { ...(raw as Record<string, unknown>) };
  squad.playerIds = remapList(squad.playerIds, player, counts.players);
  squad.startingXI = remapList(squad.startingXI, player, { n: 0 });
  for (const key of ["captainId", "viceCaptainId"] as const) {
    if (typeof squad[key] === "number") squad[key] = player(squad[key] as number);
  }
  if ("purchasePrices" in squad) squad.purchasePrices = {};
  return squad;
}

/** Rewrites one store's payload in place of its envelope, keeping its version. */
function rewriteStore(key: string, transform: (data: unknown) => unknown): void {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "version" in parsed && "data" in parsed) {
      const env = parsed as { version: unknown; data: unknown };
      localStorage.setItem(key, JSON.stringify({ version: env.version, data: transform(env.data) }));
    } else {
      localStorage.setItem(key, JSON.stringify(transform(parsed)));
    }
  } catch {
    // unreadable store: its own loader falls back as usual
  }
}

function ledgerFor(season: string, players: Pick<NormalizedPlayer, "id" | "code">[], teams: Pick<NormalizedTeam, "id" | "code">[], carry?: IdLedger | null): IdLedger {
  const playerCodes: Record<string, number> = { ...(carry?.playerCodes ?? {}) };
  const teamCodes: Record<string, number> = { ...(carry?.teamCodes ?? {}) };
  for (const p of players) if (p.code !== null) playerCodes[String(p.id)] = p.code;
  for (const t of teams) if (t.code !== null) teamCodes[String(t.id)] = t.code;
  return { season, playerCodes, teamCodes };
}

/**
 * Call with each fresh bootstrap, before any page reads the stores. Same
 * season: records any new ids (players added mid-season). New season:
 * translates every saved id, then records the new season's ids.
 */
export function rolloverSavedIds(season: string, players: Pick<NormalizedPlayer, "id" | "code">[], teams: Pick<NormalizedTeam, "id" | "code">[]): RolloverResult {
  const ledger = loadVersioned(LEDGER_KEY, LEDGER_STORE);
  const none: RolloverResult = { rolledOver: false, fromSeason: ledger?.season ?? null, droppedPlayers: 0, droppedClubs: 0 };
  if (ledger && ledger.season === season) {
    saveVersioned(LEDGER_KEY, LEDGER_VERSION, ledgerFor(season, players, teams, ledger));
    return none;
  }
  // No ledger: the saved ids were made against this season's numbering (the
  // ledger arrived mid-season 2026/27), so record it as is.
  if (!ledger) {
    saveVersioned(LEDGER_KEY, LEDGER_VERSION, ledgerFor(season, players, teams));
    return none;
  }

  const playerIdByCode = new Map<number, number>();
  for (const p of players) if (p.code !== null) playerIdByCode.set(p.code, p.id);
  const teamIdByCode = new Map<number, number>();
  for (const t of teams) if (t.code !== null) teamIdByCode.set(t.code, t.id);
  const player: Translate = (id) => {
    const code = ledger.playerCodes[String(id)];
    return code === undefined ? null : (playerIdByCode.get(code) ?? null);
  };
  const team: Translate = (id) => {
    const code = ledger.teamCodes[String(id)];
    return code === undefined ? null : (teamIdByCode.get(code) ?? null);
  };
  const counts = { players: { n: 0 }, clubs: { n: 0 } };
  const eachTileOrGraph = (data: unknown) => (Array.isArray(data) ? data.map((x) => remapTileOrGraph(x, player, team, counts)) : data);

  rewriteStore(ID_STORE_KEYS.summaryTiles, eachTileOrGraph);
  rewriteStore(ID_STORE_KEYS.dashboardGraphs, eachTileOrGraph);
  rewriteStore(ID_STORE_KEYS.savedViews, (data) =>
    Array.isArray(data)
      ? data.map((v) => (v && typeof v === "object" ? { ...(v as Record<string, unknown>), tiles: eachTileOrGraph((v as { tiles?: unknown }).tiles), graphs: eachTileOrGraph((v as { graphs?: unknown }).graphs) } : v))
      : data,
  );
  rewriteStore(ID_STORE_KEYS.savedSquads, (data) => (Array.isArray(data) ? data.map((s) => remapSquad(s, player, counts)) : data));

  saveVersioned(LEDGER_KEY, LEDGER_VERSION, ledgerFor(season, players, teams));
  return { rolledOver: true, fromSeason: ledger.season, droppedPlayers: counts.players.n, droppedClubs: counts.clubs.n };
}
