/**
 * Raw shapes returned by the official FPL API, as actually observed on the
 * live 2026/27 endpoint (inspected directly rather than assumed from prior
 * seasons — see README "Metric definitions" for the field-by-field mapping).
 *
 * These intentionally only type the fields this application uses. The FPL
 * API returns many more fields; unlisted ones are ignored, not stripped —
 * see validation/schema.ts, which uses passthrough schemas so an unexpected
 * *additional* field never breaks parsing.
 */

export interface RawElementType {
  id: number;
  plural_name: string;
  singular_name: string;
  singular_name_short: string;
}

export interface RawTeam {
  id: number;
  name: string;
  short_name: string;
  strength: number | null;
  position: number;
  played: number;
  points: number;
  win: number;
  draw: number;
  loss: number;
  unavailable: boolean;
}

export interface RawEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  data_checked: boolean;
}

/**
 * A player ("element"). Numeric-looking fields the FPL API serialises as
 * strings (e.g. "4.71") are typed as `string` here and parsed on the way
 * into the normalisation layer — never assumed to already be numbers.
 */
export interface RawElement {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number; // £0.1m units
  selected_by_percent: string;
  total_points: number;
  points_per_game: string;
  /** FPL's own official expected-points prediction for the next gameweek. Usually populated even pre-season, but null for at least some players who currently have no upcoming fixture prediction (e.g. long-term unavailable) — never assume non-null. */
  ep_next: string | null;
  minutes: number;
  starts: number | null;
  starts_per_90: number | null;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  bps: number;
  ict_index: string;
  status: string;
  news: string;
  /** 0-100, or null when there's no doubt/no data (e.g. straightforwardly available or long-term situations FPL hasn't put a percentage on). */
  chance_of_playing_next_round: number | null;

  // Advanced / expected-stats fields. Typed as optional+nullable because
  // their presence is verified at runtime (see validation/schema.ts) rather
  // than assumed — if the live API ever omits them, normalisation must
  // produce null, not crash.
  expected_goals?: string | null;
  expected_assists?: string | null;
  expected_goal_involvements?: string | null;
  expected_goals_conceded?: string | null;
  expected_goals_per_90?: number | null;
  expected_assists_per_90?: number | null;
  expected_goal_involvements_per_90?: number | null;
  expected_goals_conceded_per_90?: number | null;
  defensive_contribution?: number | null;
  defensive_contribution_per_90?: number | null;

  // Transfer-market / price-change fields. Long-standing, stable FPL API
  // fields (present on the API for years), but typed optional+nullable and
  // routed through the same detect-don't-assume AdvancedFieldAvailability
  // pattern as the expected-stats fields above, per this project's
  // "inspect, don't assume" rule — this build environment has no network
  // access to hit the live endpoint directly and confirm field-by-field.
  /** Cumulative transfers in, all-time this season. */
  transfers_in?: number | null;
  /** Cumulative transfers out, all-time this season. */
  transfers_out?: number | null;
  /** Transfers in since the last gameweek deadline (resets each event, not daily). */
  transfers_in_event?: number | null;
  /** Transfers out since the last gameweek deadline (resets each event, not daily). */
  transfers_out_event?: number | null;
  /** Signed £0.1m price movement since the last gameweek deadline (0 if unchanged this event). */
  cost_change_event?: number | null;
  /** Signed £0.1m price movement since the start of the season. */
  cost_change_start?: number | null;
  /** FPL's own short-term form rating (points/game over a recent rolling window), serialised as a string like points_per_game. */
  form?: string | null;

  // Official Price Change Predictor fields — new for 2026/27, confirmed by
  // directly inspecting a live bootstrap-static response on 24 Aug 2026 (see
  // README). Not third-party estimation: this is FPL's own published
  // progress-toward-threshold figure. Still typed optional+nullable and
  // routed through AdvancedFieldAvailability, since it's a brand-new field
  // with no history of stability yet and no official documentation of its
  // exact semantics beyond what FPL's own help copy says publicly.
  /** Current live progress toward today's price-change threshold, as a signed percentage string (e.g. "44.0" rising, "-21.1" falling). FPL describes >100 as "expected to cross the threshold at the next 00:00 UK update" — still not a guarantee. */
  price_change_percent?: string | null;
  /** FPL's own internal rate-of-change figure behind price_change_percent. Sign matches direction; no official unit is published. */
  price_change_hourly_rate?: number | null;
  /** FPL's own forward projection of price_change_percent for today (offset 0), tomorrow (offset 1), and the day after (offset 2), each with a "likelihood" figure observed ranging roughly -5..5 (sign = direction, magnitude = FPL's own confidence) — undocumented officially beyond that. */
  price_change_projections?: RawPriceChangeProjection[] | null;
  /** Timestamp string until which this player's price is locked from further movement (e.g. immediately after a change), or null. */
  price_change_locked_until?: string | null;
  /** True while FPL considers there isn't yet enough transfer history to produce a reliable prediction (e.g. a brand-new signing). */
  price_change_calibrating?: boolean | null;
}

export interface RawPriceChangeProjection {
  /** Days ahead: 0 = today's next update, 1 = tomorrow, 2 = the day after. */
  offset: number;
  projected_percent: string;
  /** Observed range roughly -5..5; sign = direction, magnitude = FPL's own confidence. No official documentation of the exact scale. */
  likelihood: number;
}

/** One chip's availability window, from bootstrap-static's top-level "chips" array — confirmed live for 2026/27: two windows per chip type (wildcard/freehit/bboost/3xc), split at the real FPL-defined gameweek boundary rather than an assumed one. */
export interface RawChip {
  id: number;
  name: "wildcard" | "freehit" | "bboost" | "3xc" | string;
  number: number;
  start_event: number;
  stop_event: number;
  chip_type: "transfer" | "team" | string;
}

export interface RawElementStat {
  label: string;
  name: string;
}

export interface RawBootstrapStatic {
  elements: RawElement[];
  teams: RawTeam[];
  element_types: RawElementType[];
  events: RawEvent[];
  element_stats: RawElementStat[];
  /** Total number of registered FPL managers — the denominator behind selected_by_percent. Optional/nullable for the same reason as the transfer fields above; used only to turn ownership% into an approximate owner count for price-change momentum. */
  total_players?: number | null;
  /** Per-chip-type availability windows for the season — see RawChip. Confirmed live for 2026/27 (two windows per chip type). */
  chips?: RawChip[] | null;
}

export interface RawFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  kickoff_time: string | null;
  finished: boolean;
  /** 1 (easiest) to 5 (hardest), FPL's own rating, from that team's perspective. Confirmed present even on unplayed fixtures. */
  team_h_difficulty: number;
  team_a_difficulty: number;
}

/** A single gameweek entry inside an element-summary "history" array. */
export interface RawElementSummaryHistory {
  element: number;
  fixture: number;
  round: number; // gameweek number
  minutes: number;
  starts: number | null;
  total_points: number;
  was_home: boolean;
}

/**
 * A single past-season summary inside an element-summary "history_past"
 * array — one entry per prior season this player appears in the FPL game
 * for (never the live/current season). Field names and types confirmed
 * directly against the live API response (see README → historical-season
 * data notes), not assumed from older seasons' documentation.
 *
 * expected_* fields are present as far back as history_past goes (even
 * seasons before FPL tracked xG show them as the string "0.00" rather than
 * omitting the key), so their *presence* can't be used to detect whether a
 * season's expected-stats are real data or a pre-tracking placeholder —
 * unlike the live bootstrap-static fields, there is no reliable
 * per-season availability signal here. See README caveat.
 */
export interface RawElementSummaryPastSeason {
  season_name: string; // e.g. "2023/24"
  element_code?: number;
  start_cost?: number; // £0.1m units
  end_cost?: number; // £0.1m units
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded?: number;
  own_goals?: number;
  penalties_saved?: number;
  penalties_missed?: number;
  yellow_cards?: number;
  red_cards?: number;
  saves?: number;
  bonus: number;
  bps: number;
  influence?: string;
  creativity?: string;
  threat?: string;
  ict_index?: string;
  starts?: number | null;
  expected_goals?: string | null;
  expected_assists?: string | null;
  expected_goal_involvements?: string | null;
  expected_goals_conceded?: string | null;
  // Genuinely tracked from the 2024/25 season onward (confirmed directly
  // against a real defender's history_past — Gabriel/Arsenal shows 159 for
  // 2024/25 and 277 for 2025/26); seasons before that show 0 as an
  // untracked placeholder rather than a real zero, same pattern as the
  // expected-stats fields. See normalizeElementSummary.ts, which nulls
  // out the placeholder seasons.
  defensive_contribution?: number | null;
}

export interface RawElementSummary {
  history: RawElementSummaryHistory[];
  history_past: RawElementSummaryPastSeason[];
}

/** One player's entry in the /api/historic-bulk response. */
export interface RawHistoricBulkPlayer {
  playerId: number;
  historyPast: RawElementSummaryPastSeason[];
}

/**
 * The whole-pool historic dataset — one bulk fetch covering every current
 * player's history_past, built server-side from many individual upstream
 * requests (no bulk endpoint exists on the official API for this). See
 * server/src/routes/historicBulk.ts.
 */
export interface RawHistoricBulk {
  players: RawHistoricBulkPlayer[];
  totalPlayers: number;
  /** Player IDs the server couldn't fetch history for (a transient upstream failure) — present but not treated as an error unless it's a large fraction of totalPlayers. */
  skippedPlayerIds: number[];
}

/**
 * Real-manager "entry" data — for the Load-from-FPL feature. entry/{id}/
 * and entry/{id}/history/ shapes below are confirmed directly against a
 * live 2026/27 response (see README); the picks shape is cross-checked
 * against several independent community write-ups rather than fetched
 * directly in this build environment, so it's typed more defensively
 * (more optional/nullable fields) than the two confirmed-live shapes.
 */
export interface RawEntryTeam {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  current_event: number | null;
  started_event?: number;
  /** £0.1m units. */
  last_deadline_bank?: number;
  /** £0.1m units — total squad value at the last deadline. */
  last_deadline_value?: number;
}

export interface RawEntryHistoryGw {
  event: number;
  bank?: number;
  value?: number;
  event_transfers?: number;
  event_transfers_cost?: number;
  points_on_bench?: number;
}

export interface RawEntryChipUsage {
  /** Expected to match bootstrap-static's chip names ("wildcard"/"freehit"/"bboost"/"3xc") — not officially guaranteed, so normalizeEntryImport.ts filters out anything it doesn't recognise rather than assuming. */
  name: string;
  event: number;
}

export interface RawEntryHistory {
  current?: RawEntryHistoryGw[];
  chips?: RawEntryChipUsage[];
}

export interface RawEntryPick {
  element: number;
  position?: number;
  /** 0 = bench, 1 = normal starting XI, 2 = captain, 3 = triple-captain-active. Not assumed present — see normalizeEntryImport.ts's fallback to `position`. */
  multiplier?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
}

export interface RawEntryPicks {
  active_chip?: string | null;
  picks?: RawEntryPick[];
}

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    source: "live" | "cache" | "stale-cache";
    fetchedAt: number;
  };
}
