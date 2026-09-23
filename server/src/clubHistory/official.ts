import type { LedgerFixture, LedgerRow, LedgerTeam } from "./types.js";

/** Only the fields this module reads — the raw payloads are passed through unvalidated from the proxy, so every read below is defensive. */
interface RawBootstrapLike {
  teams?: { id: number; code: number; name: string; short_name: string }[];
  elements?: { id: number; code: number; element_type: number }[];
  events?: { id: number; deadline_time: string }[];
}

interface RawFixtureLike {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
}

type RawHistoryRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "2026/27" from the first gameweek's deadline — the live season's own name, independent of today's date. */
export function seasonNameFromBootstrap(bootstrap: unknown): string | null {
  const events = (bootstrap as RawBootstrapLike).events ?? [];
  const first = events.find((e) => e.id === 1) ?? events[0];
  if (!first) return null;
  const year = new Date(first.deadline_time).getUTCFullYear();
  if (!Number.isFinite(year)) return null;
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

export function teamsFromBootstrap(bootstrap: unknown): LedgerTeam[] {
  return ((bootstrap as RawBootstrapLike).teams ?? []).map((t) => ({ id: t.id, code: t.code, name: t.name, shortName: t.short_name }));
}

export function fixturesFromOfficial(fixtures: unknown): LedgerFixture[] {
  return ((fixtures as RawFixtureLike[]) ?? [])
    .filter((f) => f.event !== null)
    .map((f) => ({
      id: f.id,
      event: f.event,
      teamH: f.team_h,
      teamA: f.team_a,
      teamHScore: f.team_h_score,
      teamAScore: f.team_a_score,
      finished: Boolean(f.finished),
    }));
}

/**
 * Turns each player's element-summary `history` (this season, one row per
 * fixture) into ledger rows. The club is read off the fixture itself —
 * home side if `was_home`, else away — never off the player's current
 * club, so a mid-season mover's early rows stay with his old club.
 */
export function ledgerRowsFromOfficial(bootstrap: unknown, fixtures: LedgerFixture[], historyByElement: Map<number, unknown[]>): LedgerRow[] {
  const elements = new Map(((bootstrap as RawBootstrapLike).elements ?? []).map((e) => [e.id, e]));
  const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
  const rows: LedgerRow[] = [];
  for (const [elementId, history] of historyByElement) {
    const element = elements.get(elementId);
    if (!element) continue;
    for (const raw of history as RawHistoryRow[]) {
      const fixture = fixturesById.get(num(raw.fixture) ?? -1);
      if (!fixture) continue;
      const wasHome = Boolean(raw.was_home);
      rows.push({
        fixture: fixture.id,
        element: elementId,
        code: element.code,
        team: wasHome ? fixture.teamH : fixture.teamA,
        wasHome,
        position: element.element_type,
        round: num(raw.round),
        minutes: num(raw.minutes) ?? 0,
        starts: num(raw.starts),
        totalPoints: num(raw.total_points) ?? 0,
        goals: num(raw.goals_scored) ?? 0,
        assists: num(raw.assists) ?? 0,
        ownGoals: num(raw.own_goals),
        cleanSheets: num(raw.clean_sheets) ?? 0,
        goalsConceded: num(raw.goals_conceded),
        saves: num(raw.saves),
        bonus: num(raw.bonus) ?? 0,
        bps: num(raw.bps),
        xG: num(raw.expected_goals),
        xA: num(raw.expected_assists),
        xGI: num(raw.expected_goal_involvements),
        xGC: num(raw.expected_goals_conceded),
        dc: num(raw.defensive_contribution),
      });
    }
  }
  return rows;
}
