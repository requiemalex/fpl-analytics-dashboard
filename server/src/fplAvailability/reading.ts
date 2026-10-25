/**
 * <availability_record>: FPL's availability news (status, chance of
 * playing, news text) as it stands before each gameweek's deadline, kept in
 * data/fpl-availability/<season>/gwNN.json. FPL only ever serves today's
 * news, so without a record no past deadline's can be known — and Team
 * Building's Model Predicted can't be fitted or proven on what the news
 * said. The hourly workflow (.github/workflows/fpl-availability.yml,
 * scripts/fpl-availability/record.ts) rewrites the next deadline's file
 * whenever the news changes, so once the deadline passes the file holds the
 * last reading taken before it. The model's fitting reads these files
 * (client/scripts/pointsModel/history.ts); the app itself doesn't.
 *
 * Dependency-free (Node built-ins only), so the workflow runs it with tsx
 * and no install.
 */
import { seasonNameFromBootstrap } from "../clubHistory/official.js";

/** Only the fields read here; the payload is unvalidated, so every read is defensive. */
interface RawBootstrapLike {
  events?: { id: number; deadline_time: string; is_next?: boolean }[];
  elements?: {
    id: number;
    code: number;
    status?: string;
    chance_of_playing_next_round?: number | null;
    chance_of_playing_this_round?: number | null;
    news?: string;
    news_added?: string | null;
  }[];
}

/** One player with news: anyone not "a" (available), with a chance of playing, or with news text. */
export interface AvailabilityEntry {
  /** FPL's stable player code. */
  code: number;
  /** That season's element id. */
  element: number;
  status: string;
  chanceNextRound: number | null;
  chanceThisRound: number | null;
  news: string;
  newsAdded: string | null;
}

export interface AvailabilityReading {
  season: string;
  gameweek: number;
  deadline: string;
  /** When this reading was first seen (it stood until the deadline unless a later reading replaced the file). */
  recordedAt: string;
  /** Players in the game at the time; anyone not in `players` was available ("a") with no news. */
  pool: number;
  players: AvailabilityEntry[];
}

const nullableNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The reading for the next deadline, or null when there's none to take: no
 * next gameweek (the season's over), its deadline has passed, or the
 * payload has no players.
 */
export function availabilityReading(bootstrap: unknown, now: Date): AvailabilityReading | null {
  const b = bootstrap as RawBootstrapLike;
  const next = (b.events ?? []).find((e) => e.is_next === true);
  const season = seasonNameFromBootstrap(bootstrap);
  const elements = b.elements ?? [];
  if (!next || season === null || elements.length === 0) return null;
  const deadline = Date.parse(next.deadline_time);
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) return null;
  const players = elements
    .map(
      (e): AvailabilityEntry => ({
        code: e.code,
        element: e.id,
        status: typeof e.status === "string" ? e.status : "",
        chanceNextRound: nullableNumber(e.chance_of_playing_next_round),
        chanceThisRound: nullableNumber(e.chance_of_playing_this_round),
        news: typeof e.news === "string" ? e.news : "",
        newsAdded: typeof e.news_added === "string" ? e.news_added : null,
      }),
    )
    .filter((p) => p.status !== "a" || p.chanceNextRound !== null || p.news !== "")
    .sort((x, y) => x.code - y.code);
  return { season, gameweek: next.id, deadline: next.deadline_time, recordedAt: now.toISOString(), pool: elements.length, players };
}

/** Whether `next` says anything `previous` doesn't (the time it was taken aside). */
export function readingChanged(previous: AvailabilityReading | null, next: AvailabilityReading): boolean {
  if (previous === null) return true;
  const { recordedAt: _a, ...p } = previous;
  const { recordedAt: _b, ...n } = next;
  return JSON.stringify(p) !== JSON.stringify(n);
}

/** data/fpl-availability/2026-27/gw09.json, relative to the repo root. */
export function readingPath(reading: Pick<AvailabilityReading, "season" | "gameweek">): string {
  return `data/fpl-availability/${reading.season.replace("/", "-")}/gw${String(reading.gameweek).padStart(2, "0")}.json`;
}

/** The file's text: one player per line, so a change shows as the lines that changed. */
export function formatReading(reading: AvailabilityReading): string {
  const { players, ...head } = reading;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const rows = players.map((p) => `    ${JSON.stringify(p)}`).join(",\n");
  return `${top},\n  "players": [${players.length ? `\n${rows}\n  ` : ""}]\n}\n`;
}
