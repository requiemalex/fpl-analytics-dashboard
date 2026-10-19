import { z } from "zod";

/**
 * The /api/understat payload (server/src/understat/route.ts), checked
 * before anything reads it. Same rule as the FPL data: one bad player or
 * club record is skipped and counted, never fatal (see parseUnderstatPayload).
 */

const slice = z.object({ shots: z.number(), goals: z.number(), xG: z.number() });
const situations = z.object({ OpenPlay: slice, FromCorner: slice, SetPiece: slice, DirectFreekick: slice, Penalty: slice });
const bodyParts = z.object({ RightFoot: slice, LeftFoot: slice, Head: slice, OtherBodyPart: slice });
/**
 * Woodwork, blocked and assisted shots, and shots by the action before
 * them (server/src/understat/pipeline/types.ts ShotDetail). Optional: a
 * season file written before the sync added it has none, and its figures
 * are "—" (never 0) until the next sync rewrites it.
 */
const shotDetail = z.object({
  woodwork: z.number(),
  blocked: z.number(),
  assisted: z.number(),
  lastActions: z.object({ Cross: slice, Throughball: slice, TakeOn: slice, Rebound: slice }),
});

export const usPlayerSchema = z.object({
  understatId: z.string(),
  appearances: z.number(),
  minutes: z.number(),
  goals: z.number(),
  assists: z.number(),
  shots: z.number(),
  shotsOnTarget: z.number(),
  keyPasses: z.number(),
  xG: z.number(),
  xA: z.number(),
  npxG: z.number(),
  npGoals: z.number(),
  xGChain: z.number(),
  xGBuildup: z.number(),
  situations,
  bodyParts,
  shotDetail: shotDetail.optional(),
  /** <incomplete_shot_list> (server/src/understat/pipeline/types.ts). */
  shotsComplete: z.boolean().default(true),
});

export const usClubSchema = z.object({
  understatTeamId: z.string(),
  played: z.number(),
  xG: z.number(),
  xGA: z.number(),
  npxG: z.number(),
  npxGA: z.number(),
  ppdaAtt: z.number(),
  ppdaDef: z.number(),
  ppdaAllowedAtt: z.number(),
  ppdaAllowedDef: z.number(),
  deep: z.number(),
  deepAllowed: z.number(),
  xPts: z.number(),
  pts: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  assists: z.number(),
  xA: z.number(),
  keyPasses: z.number(),
  shots: z.number(),
  shotsOnTarget: z.number(),
  shotsAgainst: z.number(),
  shotsOnTargetAgainst: z.number(),
  situationsFor: situations,
  situationsAgainst: situations,
  shotDetailFor: shotDetail.optional(),
  shotDetailAgainst: shotDetail.optional(),
  shotsCompleteFor: z.boolean().default(true),
  shotsCompleteAgainst: z.boolean().default(true),
});

export type UsPlayerTotals = z.infer<typeof usPlayerSchema>;
export type UsClubTotals = z.infer<typeof usClubSchema>;
export type UsSlice = z.infer<typeof slice>;
export type UsShotDetail = z.infer<typeof shotDetail>;

const seasonFileShell = z.object({
  season: z.string(),
  complete: z.boolean(),
  matchesIncluded: z.number(),
  latestMatchDate: z.string().nullable(),
  players: z.record(z.string(), z.unknown()),
  clubs: z.record(z.string(), z.unknown()),
});

const statusSchema = z.object({
  generatedAt: z.string(),
  liveSeason: z.string(),
  seasons: z.array(z.string()),
  latestMatchDate: z.string().nullable(),
  missingFixtures: z.record(z.string(), z.string()),
});

const payloadSchema = z.union([
  z.object({ enabled: z.literal(false), note: z.string().nullable().optional() }),
  z.object({ enabled: z.literal(true), status: statusSchema, seasons: z.record(z.string(), seasonFileShell) }),
]);

export interface UsSeason {
  season: string;
  complete: boolean;
  latestMatchDate: string | null;
  /** By FPL player code. */
  players: Map<number, UsPlayerTotals>;
  /** By FPL club code. */
  clubs: Map<number, UsClubTotals>;
}

export type UnderstatData =
  | { enabled: false }
  | {
      enabled: true;
      /** When the sync that published this data ran: it changes with each sync. */
      generatedAt: string;
      liveSeason: string;
      latestMatchDate: string | null;
      /** FPL fixtures finished a while ago that Understat hasn't got yet: id -> first noticed. */
      missingFixtures: Record<string, string>;
      seasons: Map<string, UsSeason>;
      skippedRecords: number;
    };

/** Throws on a payload whose overall shape is wrong; skips (and counts) a bad individual record. */
export function parseUnderstatPayload(raw: unknown): UnderstatData {
  const parsed = payloadSchema.parse(raw);
  if (!parsed.enabled) return { enabled: false };
  let skipped = 0;
  const seasons = new Map<string, UsSeason>();
  for (const [name, file] of Object.entries(parsed.seasons)) {
    const players = new Map<number, UsPlayerTotals>();
    for (const [code, value] of Object.entries(file.players)) {
      const r = usPlayerSchema.safeParse(value);
      if (r.success && Number.isFinite(Number(code))) players.set(Number(code), r.data);
      else skipped += 1;
    }
    const clubs = new Map<number, UsClubTotals>();
    for (const [code, value] of Object.entries(file.clubs)) {
      const r = usClubSchema.safeParse(value);
      if (r.success && Number.isFinite(Number(code))) clubs.set(Number(code), r.data);
      else skipped += 1;
    }
    seasons.set(name, { season: file.season, complete: file.complete, latestMatchDate: file.latestMatchDate, players, clubs });
  }
  return {
    enabled: true,
    generatedAt: parsed.status.generatedAt,
    liveSeason: parsed.status.liveSeason,
    latestMatchDate: parsed.status.latestMatchDate,
    missingFixtures: parsed.status.missingFixtures,
    seasons,
    skippedRecords: skipped,
  };
}
