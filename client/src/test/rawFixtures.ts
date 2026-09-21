import type { RawElement, RawElementType, RawTeam } from "../types/raw";

/** Minimal-but-complete RawElement builder for normalize/ tests. Only required fields are defaulted; advanced/optional fields are left undefined by default so tests can opt in per-field to exercise AdvancedFieldAvailability detection. */
export function makeRawElement(overrides: Partial<RawElement> & { id: number }): RawElement {
  return {
    first_name: "First",
    second_name: "Last",
    web_name: `Player${overrides.id}`,
    team: 1,
    element_type: 3,
    now_cost: 50,
    selected_by_percent: "10.0",
    total_points: 0,
    points_per_game: "0.0",
    ep_next: null,
    minutes: 0,
    starts: null,
    starts_per_90: null,
    goals_scored: 0,
    assists: 0,
    clean_sheets: 0,
    bonus: 0,
    bps: 0,
    ict_index: "0.0",
    status: "a",
    news: "",
    chance_of_playing_next_round: null,
    ...overrides,
  };
}

export const RAW_ELEMENT_TYPES: RawElementType[] = [
  { id: 1, plural_name: "Goalkeepers", singular_name: "Goalkeeper", singular_name_short: "GKP" },
  { id: 2, plural_name: "Defenders", singular_name: "Defender", singular_name_short: "DEF" },
  { id: 3, plural_name: "Midfielders", singular_name: "Midfielder", singular_name_short: "MID" },
  { id: 4, plural_name: "Forwards", singular_name: "Forward", singular_name_short: "FWD" },
];

export function makeRawTeam(overrides: Partial<RawTeam> & { id: number }): RawTeam {
  return {
    name: `Team ${overrides.id}`,
    short_name: `T${overrides.id}`,
    strength: 3,
    position: 1,
    played: 0,
    points: 0,
    win: 0,
    draw: 0,
    loss: 0,
    unavailable: false,
    ...overrides,
  };
}
