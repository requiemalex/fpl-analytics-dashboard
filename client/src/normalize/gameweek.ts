import type { RawEvent } from "../types/raw";
import type { ChipWindow, EventSummary, GameweekState, NormalizedEvent, NormalizedFixture } from "../types/normalized";

const CHIPS: ChipWindow["chip"][] = ["wildcard", "freehit", "bboost", "3xc"];

/** <gameweek_summary>: FPL's figures for the gameweek across every manager, each null until it has them. */
function eventSummary(e: RawEvent): EventSummary {
  const chipPlays: EventSummary["chipPlays"] = {};
  for (const c of e.chip_plays ?? []) {
    const chip = c.chip_name.toLowerCase() as ChipWindow["chip"];
    if (CHIPS.includes(chip)) chipPlays[chip] = c.num_played;
  }
  return {
    averageScore: e.average_entry_score ?? null,
    highestScore: e.highest_score ?? null,
    rankedCount: e.ranked_count ?? null,
    mostCaptainedId: e.most_captained ?? null,
    mostViceCaptainedId: e.most_vice_captained ?? null,
    topScorer: e.top_element_info ?? null,
    chipPlays,
  };
}

function toNormalizedEvent(e: RawEvent): NormalizedEvent {
  return {
    id: e.id,
    name: e.name,
    deadlineTime: e.deadline_time,
    finished: e.finished,
    isCurrent: e.is_current,
    isNext: e.is_next,
    isPrevious: e.is_previous,
    summary: eventSummary(e),
  };
}

/** The full 38-gameweek events list, normalized — every gameweek's deadline, not just the current one. */
export function normalizeEvents(rawEvents: RawEvent[]): NormalizedEvent[] {
  return rawEvents.map(toNormalizedEvent);
}

/**
 * Determines gameweek state exclusively from the live 2026/27 events data —
 * never a previous season's gameweek, and a completed gameweek is never
 * labelled "Current".
 */
export function deriveGameweekState(rawEvents: RawEvent[]): GameweekState {
  const events = normalizeEvents(rawEvents);

  const current = events.find((e) => e.isCurrent);
  if (current) {
    return { kind: "current", event: current };
  }

  const finished = events.filter((e) => e.finished);
  if (finished.length > 0) {
    // "Most recently completed" — events are numbered in chronological order.
    const lastCompleted = finished.reduce((latest, e) => (e.id > latest.id ? e : latest));
    return { kind: "last-completed", event: lastCompleted };
  }

  return { kind: "pre-season" };
}

/**
 * Whether this season's matches have started — the switch for
 * <live_mode_preseason_fix> (resolvePlayerStats.ts): until then FPL's live
 * player fields still carry last season's totals. A finished fixture is the
 * earliest sign; a finished gameweek (bootstrap-static, fetched separately)
 * is the fallback, so a failed fixtures request — which leaves the list
 * empty — can't make a season in progress look unstarted and zero every
 * live figure (audit 2026-09-25 player-team-profiles R3).
 */
export function seasonHasStarted(fixtures: Pick<NormalizedFixture, "finished">[], events: Pick<NormalizedEvent, "finished">[]): boolean {
  return fixtures.some((f) => f.finished) || events.some((e) => e.finished);
}
