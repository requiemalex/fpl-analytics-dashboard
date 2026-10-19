import { z } from "zod";
import { getEnvelope } from "../api/client";

/**
 * One player's or club's Understat detail for one season
 * (/api/understat/profile/…, server/src/understat/route.ts), checked before
 * anything reads it. Every row names the FPL fixture it belongs to.
 */

/** A per-match figure a file written before it was added doesn't have: null ("—"), never 0. */
const maybe = z.number().nullable().default(null);

const shot = z.object({
  fixture: z.number(),
  minute: z.number(),
  /** 0–1 along the pitch towards the goal being attacked. */
  x: z.number(),
  /** 0–1 across it, from the shooter's right touchline. */
  y: z.number(),
  xG: z.number(),
  result: z.string(),
  situation: z.string(),
  shotType: z.string(),
});

const formation = z.object({
  formation: z.string(),
  minutes: z.number(),
  shots: z.number(),
  goals: z.number(),
  xG: z.number(),
  shotsAgainst: z.number(),
  goalsAgainst: z.number(),
  xGA: z.number(),
});

const playerSlice = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), available: z.literal(false) }),
  z.object({ enabled: z.literal(true), available: z.literal(true), found: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    available: z.literal(true),
    found: z.literal(true),
    matches: z.array(
      z.object({ fixture: z.number(), position: z.string(), minutes: z.number(), xG: maybe, xA: maybe, assists: maybe }),
    ),
    shots: z.array(shot),
  }),
]);

const clubSlice = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), available: z.literal(false) }),
  z.object({ enabled: z.literal(true), available: z.literal(true), found: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    available: z.literal(true),
    found: z.literal(true),
    matches: z.array(
      z.object({
        fixture: z.number(),
        win: z.number().nullable(),
        draw: z.number().nullable(),
        loss: z.number().nullable(),
        xG: maybe,
        xGA: maybe,
        xA: maybe,
        assists: maybe,
      }),
    ),
    shots: z.array(shot),
    shotsAgainst: z.array(shot),
    formations: z.array(formation).nullable(),
  }),
]);

export type UsShot = z.infer<typeof shot>;
export type UsFormation = z.infer<typeof formation>;

export interface UsPlayerSeasonDetail {
  matches: { fixture: number; position: string; minutes: number; xG: number | null; xA: number | null; assists: number | null }[];
  shots: UsShot[];
}

export interface UsClubSeasonDetail {
  matches: {
    fixture: number;
    win: number | null;
    draw: number | null;
    loss: number | null;
    /** The club's xG and xG against in the match (per chance), and its players' xA and assists. */
    xG: number | null;
    xGA: number | null;
    xA: number | null;
    assists: number | null;
  }[];
  shots: UsShot[];
  shotsAgainst: UsShot[];
  /** Null when the season's formations aren't available (not fetched yet, or the club's didn't check out). */
  formations: UsFormation[] | null;
}

/**
 * A season's detail as loaded: `none` when Understat has nothing for it —
 * no file for the season, a player not linked, or one who didn't play —
 * which the cards treat as unknown ("—"), never as 0.
 */
export type DetailLoad<T> = { state: "loading" } | { state: "error"; message: string } | { state: "none" } | { state: "ready"; detail: T };

const folder = (season: string) => season.replace("/", "-");

export async function fetchPlayerDetail(code: number, season: string): Promise<DetailLoad<UsPlayerSeasonDetail>> {
  const envelope = await getEnvelope<unknown>(`/api/understat/profile/player/${code}/${folder(season)}`);
  const d = playerSlice.parse(envelope.data);
  if (!d.enabled || !d.available || !d.found) return { state: "none" };
  return { state: "ready", detail: { matches: d.matches, shots: d.shots } };
}

export async function fetchClubDetail(code: number, season: string): Promise<DetailLoad<UsClubSeasonDetail>> {
  const envelope = await getEnvelope<unknown>(`/api/understat/profile/club/${code}/${folder(season)}`);
  const d = clubSlice.parse(envelope.data);
  if (!d.enabled || !d.available || !d.found) return { state: "none" };
  return { state: "ready", detail: { matches: d.matches, shots: d.shots, shotsAgainst: d.shotsAgainst, formations: d.formations } };
}
