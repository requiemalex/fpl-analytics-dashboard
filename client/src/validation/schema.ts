import { z } from "zod";

/**
 * Schema validation happens before anything touches the normalisation
 * layer. Core fields the app cannot function without are required;
 * advanced/expected-stats fields are optional+nullable, because their
 * absence must be handled gracefully (→ null → "—"), never crash the app.
 *
 * `.passthrough()` on object schemas means unrecognised *additional*
 * fields from the API are tolerated (the FPL API returns many fields this
 * app doesn't use) — we only fail closed when a field we DEPEND on is
 * missing or the wrong type.
 */

export const elementTypeSchema = z
  .object({
    id: z.number(),
    plural_name: z.string(),
    singular_name: z.string(),
    singular_name_short: z.string(),
  })
  .passthrough();

export const teamSchema = z
  .object({
    id: z.number(),
    code: z.number().nullable().optional(),
    name: z.string(),
    short_name: z.string(),
    strength: z.number().nullable().optional(),
    strength_overall_home: z.number().nullable().optional(),
    strength_overall_away: z.number().nullable().optional(),
    position: z.number().optional().default(0),
    played: z.number().optional().default(0),
    points: z.number().optional().default(0),
    win: z.number().optional().default(0),
    draw: z.number().optional().default(0),
    loss: z.number().optional().default(0),
    unavailable: z.boolean().optional().default(false),
  })
  .passthrough();

export const eventSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    deadline_time: z.string(),
    finished: z.boolean(),
    is_previous: z.boolean(),
    is_current: z.boolean(),
    is_next: z.boolean(),
  })
  .passthrough();

export const elementSchema = z
  .object({
    id: z.number(),
    code: z.number().nullable().optional(),
    first_name: z.string(),
    second_name: z.string(),
    web_name: z.string(),
    team: z.number(),
    element_type: z.number(),
    now_cost: z.number(),
    selected_by_percent: z.string(),
    total_points: z.number(),
    points_per_game: z.string(),
    ep_next: z.string().nullable().optional().default("0.0"),
    minutes: z.number(),
    starts: z.number().nullable().optional(),
    starts_per_90: z.number().nullable().optional(),
    goals_scored: z.number(),
    assists: z.number(),
    clean_sheets: z.number(),
    goals_conceded: z.number().nullable().optional(),
    bonus: z.number(),
    bps: z.number(),
    ict_index: z.string(),
    saves: z.number().nullable().optional(),
    saves_per_90: z.number().nullable().optional(),
    status: z.string().optional().default("a"),
    news: z.string().optional().default(""),
    chance_of_playing_next_round: z.number().nullable().optional().default(null),

    expected_goals: z.string().nullable().optional(),
    expected_assists: z.string().nullable().optional(),
    expected_goal_involvements: z.string().nullable().optional(),
    expected_goals_conceded: z.string().nullable().optional(),
    expected_goals_per_90: z.number().nullable().optional(),
    expected_assists_per_90: z.number().nullable().optional(),
    expected_goal_involvements_per_90: z.number().nullable().optional(),
    expected_goals_conceded_per_90: z.number().nullable().optional(),
    defensive_contribution: z.number().nullable().optional(),
    defensive_contribution_per_90: z.number().nullable().optional(),

    transfers_in: z.number().nullable().optional(),
    transfers_out: z.number().nullable().optional(),
    transfers_in_event: z.number().nullable().optional(),
    transfers_out_event: z.number().nullable().optional(),
    cost_change_event: z.number().nullable().optional(),
    cost_change_start: z.number().nullable().optional(),
    form: z.string().nullable().optional(),

    price_change_percent: z.string().nullable().optional(),
    price_change_hourly_rate: z.number().nullable().optional(),
    price_change_projections: z
      .array(z.object({ offset: z.number(), projected_percent: z.string(), likelihood: z.number() }).passthrough())
      .nullable()
      .optional(),
    price_change_locked_until: z.string().nullable().optional(),
    price_change_calibrating: z.boolean().nullable().optional(),
  })
  .passthrough();

export const chipSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    number: z.number(),
    start_event: z.number(),
    stop_event: z.number(),
    chip_type: z.string(),
  })
  .passthrough();

export const elementStatSchema = z
  .object({
    label: z.string(),
    name: z.string(),
  })
  .passthrough();

// `elements` is deliberately validated as z.unknown() at this top level, not
// z.array(elementSchema) — a single malformed player record must not fail
// the whole bootstrap-static parse closed (see parseBootstrapStatic below,
// which validates each element individually and skips only the bad ones,
// matching normalizePlayers.ts's own per-record skippedCount mechanism and
// CLAUDE.md's "graceful degradation over crashes" principle).
export const bootstrapStaticSchema = z
  .object({
    elements: z.array(z.unknown()),
    teams: z.array(teamSchema),
    element_types: z.array(elementTypeSchema),
    events: z.array(eventSchema),
    element_stats: z.array(elementStatSchema),
    total_players: z.number().nullable().optional(),
    chips: z.array(chipSchema).nullable().optional(),
  })
  .passthrough();

export const fixtureSchema = z
  .object({
    id: z.number(),
    event: z.number().nullable(),
    team_h: z.number(),
    team_a: z.number(),
    team_h_score: z.number().nullable(),
    team_a_score: z.number().nullable(),
    kickoff_time: z.string().nullable(),
    finished: z.boolean(),
    team_h_difficulty: z.number().optional().default(3),
    team_a_difficulty: z.number().optional().default(3),
  })
  .passthrough();

export const fixturesSchema = z.array(fixtureSchema);

export const elementSummaryHistorySchema = z
  .object({
    element: z.number(),
    fixture: z.number(),
    round: z.number(),
    minutes: z.number(),
    starts: z.number().nullable().optional(),
    total_points: z.number(),
    was_home: z.boolean(),
    opponent_team: z.number(),
    team_h_score: z.number().nullable().optional(),
    team_a_score: z.number().nullable().optional(),
    goals_scored: z.number().optional().default(0),
    assists: z.number().optional().default(0),
    clean_sheets: z.number().optional().default(0),
    goals_conceded: z.number().optional().default(0),
    own_goals: z.number().optional().default(0),
    penalties_saved: z.number().optional().default(0),
    penalties_missed: z.number().optional().default(0),
    yellow_cards: z.number().optional().default(0),
    red_cards: z.number().optional().default(0),
    saves: z.number().optional().default(0),
    bonus: z.number().optional().default(0),
    bps: z.number().optional().default(0),
    clearances_blocks_interceptions: z.number().optional().default(0),
    recoveries: z.number().optional().default(0),
    tackles: z.number().optional().default(0),
    defensive_contribution: z.number().optional().default(0),
    expected_goals: z.string().nullable().optional(),
    expected_assists: z.string().nullable().optional(),
    expected_goal_involvements: z.string().nullable().optional(),
    expected_goals_conceded: z.string().nullable().optional(),
  })
  .passthrough();

export const elementSummaryPastSeasonSchema = z
  .object({
    season_name: z.string(),
    element_code: z.number().optional(),
    start_cost: z.number().optional(),
    end_cost: z.number().optional(),
    total_points: z.number(),
    minutes: z.number(),
    goals_scored: z.number().optional().default(0),
    assists: z.number().optional().default(0),
    clean_sheets: z.number().optional().default(0),
    goals_conceded: z.number().nullable().optional(),
    bonus: z.number().optional().default(0),
    bps: z.number().optional().default(0),
    influence: z.string().optional(),
    creativity: z.string().optional(),
    threat: z.string().optional(),
    ict_index: z.string().optional(),
    starts: z.number().nullable().optional(),
    expected_goals: z.string().nullable().optional(),
    expected_assists: z.string().nullable().optional(),
    expected_goal_involvements: z.string().nullable().optional(),
    expected_goals_conceded: z.string().nullable().optional(),
    defensive_contribution: z.number().nullable().optional(),
  })
  .passthrough();

export const elementSummarySchema = z
  .object({
    history: z.array(elementSummaryHistorySchema),
    history_past: z.array(elementSummaryPastSeasonSchema).optional().default([]),
  })
  .passthrough();

export const historicBulkPlayerSchema = z
  .object({
    playerId: z.number(),
    historyPast: z.array(elementSummaryPastSeasonSchema),
  })
  .passthrough();

const clubPlayerSeasonSchema = z
  .object({
    code: z.number(),
    minutes: z.number(),
    starts: z.number().nullable(),
    totalPoints: z.number(),
    goals: z.number(),
    assists: z.number(),
    cleanSheets: z.number(),
    bonus: z.number(),
    xG: z.number().nullable(),
    xA: z.number().nullable(),
    xGI: z.number().nullable(),
    xGC: z.number().nullable(),
    dc: z.number().nullable(),
  })
  .passthrough();

export const clubSeasonSchema = z
  .object({
    season: z.string(),
    code: z.number(),
    name: z.string(),
    shortName: z.string(),
    complete: z.boolean(),
    played: z.number(),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    goalsFor: z.number(),
    goalsAgainst: z.number(),
    cleanSheets: z.number(),
    leaguePoints: z.number(),
    leaguePosition: z.number(),
    fantasyPoints: z.number(),
    goals: z.number(),
    assists: z.number(),
    bonus: z.number(),
    xG: z.number().nullable(),
    xA: z.number().nullable(),
    xGI: z.number().nullable(),
    xGC: z.number().nullable(),
    dc: z.number().nullable(),
    players: z.array(clubPlayerSeasonSchema),
  })
  .passthrough();

export const historicBulkSchema = z
  .object({
    players: z.array(historicBulkPlayerSchema),
    totalPlayers: z.number(),
    clubSeasons: z.array(clubSeasonSchema).optional().default([]),
    skippedPlayerIds: z.array(z.number()).optional().default([]),
  })
  .passthrough();

export const entryTeamSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    player_first_name: z.string(),
    player_last_name: z.string(),
    current_event: z.number().nullable(),
    started_event: z.number().optional(),
    last_deadline_bank: z.number().optional(),
    last_deadline_value: z.number().optional(),
  })
  .passthrough();

export const entryHistoryGwSchema = z
  .object({
    event: z.number(),
    bank: z.number().optional(),
    value: z.number().optional(),
    event_transfers: z.number().optional(),
    event_transfers_cost: z.number().optional(),
    points_on_bench: z.number().optional(),
  })
  .passthrough();

export const entryChipUsageSchema = z.object({ name: z.string(), event: z.number() }).passthrough();

export const entryHistorySchema = z
  .object({
    current: z.array(entryHistoryGwSchema).optional().default([]),
    chips: z.array(entryChipUsageSchema).optional().default([]),
  })
  .passthrough();

export const entryPickSchema = z
  .object({
    element: z.number(),
    position: z.number().optional(),
    multiplier: z.number().optional(),
    is_captain: z.boolean().optional(),
    is_vice_captain: z.boolean().optional(),
  })
  .passthrough();

export const entryPicksSchema = z
  .object({
    active_chip: z.string().nullable().optional(),
    picks: z.array(entryPickSchema).optional().default([]),
  })
  .passthrough();

export class SchemaValidationError extends Error {
  context: string;
  issues: z.ZodIssue[];

  constructor(context: string, issues: z.ZodIssue[]) {
    super(`Unexpected API response structure for ${context}: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.name = "SchemaValidationError";
    this.context = context;
    this.issues = issues;
  }
}

export function validate<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SchemaValidationError(context, result.error.issues);
  }
  return result.data;
}

export interface BootstrapStaticParseResult {
  /** Structurally RawBootstrapStatic-shaped — elements is already filtered to schema-valid records only. Left untyped here since types/raw.ts's RawElement is the canonical shape callers should cast to. */
  bootstrap: { elements: z.infer<typeof elementSchema>[] } & Record<string, unknown>;
  /** Player records dropped because they failed elementSchema validation (e.g. a required field was null/missing) — distinct from normalizePlayers.ts's skippedCount, which counts schema-valid records that fail semantic normalisation (unknown team/position id). Both should be surfaced together to the user. */
  skippedElementCount: number;
}

/**
 * Validates bootstrap-static's top-level shape strictly (teams/element_types/
 * events/element_stats are still fail-closed — a broken shape there really
 * does mean the response can't be trusted at all), but validates `elements`
 * per-record: one malformed player must not take down the whole pool.
 */
export function parseBootstrapStatic(data: unknown, context = "bootstrap-static"): BootstrapStaticParseResult {
  const result = bootstrapStaticSchema.safeParse(data);
  if (!result.success) {
    throw new SchemaValidationError(context, result.error.issues);
  }

  const validElements: z.infer<typeof elementSchema>[] = [];
  let skippedElementCount = 0;
  for (const rawElement of result.data.elements) {
    const parsedElement = elementSchema.safeParse(rawElement);
    if (parsedElement.success) {
      validElements.push(parsedElement.data);
    } else {
      skippedElementCount += 1;
    }
  }

  return {
    bootstrap: { ...result.data, elements: validElements },
    skippedElementCount,
  };
}
