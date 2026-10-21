import type { UsLineup } from "./profileData";

/**
 * Who starts where in a club's formations, from Understat's line-ups.
 *
 * Understat gives each starter his slot in the formation the club started
 * in (GK, DL, DC, DR, DMC, MC, AML, FW, …). The slots come from a fixed
 * set of formation templates (26 distinct XIs over 10 seasons, 7,740
 * club-matches), so the XI names the formation: count the slots in each
 * line and join them, as Understat names its formations — 4 defenders, 2
 * holding midfielders, 3 attacking midfielders and a striker is 4-2-3-1.
 * Wing-backs (DML, DMR) are counted in midfield, as in 3-4-2-1, and the
 * forwards are always named, so 4-2-4-0 keeps its 0. Checked against
 * Understat's own formation list for each club and season: 7,734 of the
 * 7,740 XIs name a formation that club used that season.
 *
 * A formation is drawn from the XI the club most often started it with;
 * a starter in a slot that XI hasn't (one name, two slightly different
 * XIs: a 3-4-2-1 with wing-backs or with wide midfielders) is counted in
 * its nearest slot in the same line, on the same side where there is one.
 */

/** A formation's lines, in the order its name counts them: defence, holding midfield, midfield, attacking midfield, forwards. */
const LINE_OF: Record<string, number> = {
  DL: 0, DC: 0, DR: 0,
  DMC: 1,
  DML: 2, DMR: 2, ML: 2, MC: 2, MR: 2,
  AML: 3, AMC: 3, AMR: 3,
  FWL: 4, FW: 4, FWR: 4,
};
const FORWARD_LINE = 4;
/** Left to right as the team attacks up the screen. */
const SIDE_OF = (code: string) => (code.endsWith("L") ? -1 : code.endsWith("R") ? 1 : 0);
/** How far up the pitch a slot sits, for the nearest slot in a line (wing-backs sit deeper than wide midfielders). */
const DEPTH_OF = (code: string) => (code.startsWith("DM") ? 1 : code.startsWith("AM") ? 3 : code.startsWith("FW") ? 4 : code.startsWith("D") ? 0 : 2);

export const GOALKEEPER = "GK";

/** The formation an XI's slots name ("4-2-3-1"); null when a slot isn't one Understat uses. */
export function formationOf(positions: string[]): string | null {
  const lines = [0, 0, 0, 0, 0];
  for (const p of positions) {
    if (p === GOALKEEPER) continue;
    const line = LINE_OF[p];
    if (line === undefined) return null;
    lines[line] += 1;
  }
  const named = lines.slice(0, FORWARD_LINE).filter((n) => n > 0);
  return [...named, lines[FORWARD_LINE]].join("-");
}

export interface SlotPlayer {
  /** FPL code; null when he isn't linked to an FPL player. */
  code: number | null;
  /** Understat's name for him. */
  name: string;
  starts: number;
}

export interface FormationSlot {
  /** Understat's slot ("DC"). */
  position: string;
  /** Who started there, most starts first. */
  players: SlotPlayer[];
}

export interface FormationLineups {
  formation: string;
  /** Matches the club started in this formation. */
  starts: number;
  /** The formation's lines, forwards first and the goalkeeper last; each line's slots left to right. */
  lines: FormationSlot[][];
}

function templateFor(xis: string[][]): string[] {
  const seen = new Map<string, { xi: string[]; n: number }>();
  for (const xi of xis) {
    const key = [...xi].sort().join(" ");
    const entry = seen.get(key) ?? { xi, n: 0 };
    entry.n += 1;
    seen.set(key, entry);
  }
  return [...seen.values()].sort((a, b) => b.n - a.n)[0].xi;
}

/** The template slot a starter's position is counted in: itself, else the nearest in its line (same side first, then nearest depth). */
function slotFor(position: string, template: Set<string>): string {
  if (template.has(position)) return position;
  const line = LINE_OF[position];
  const candidates = [...template].filter((t) => LINE_OF[t] === line);
  if (candidates.length === 0) return position;
  const cost = (t: string) => Math.abs(SIDE_OF(t) - SIDE_OF(position)) * 10 + Math.abs(DEPTH_OF(t) - DEPTH_OF(position));
  return candidates.sort((a, b) => cost(a) - cost(b) || a.localeCompare(b))[0];
}

/**
 * The club's starters in one formation, by slot, over the matches it
 * started in it. Several identical slots (two centre-backs) share their
 * starters out in turn, most starts first — Understat doesn't say which of
 * the two is on the left. Null when the club never started in it (used
 * only after a change during a match).
 */
export function formationLineups(formation: string, lineups: UsLineup[]): FormationLineups | null {
  const matches = lineups.filter((l) => formationOf(l.starters.map((s) => s.position)) === formation);
  if (matches.length === 0) return null;
  const template = templateFor(matches.map((m) => m.starters.map((s) => s.position)));
  const templateSet = new Set(template);
  const bySlot = new Map<string, Map<string, SlotPlayer>>();
  for (const m of matches) {
    for (const s of m.starters) {
      const slot = slotFor(s.position, templateSet);
      const players = bySlot.get(slot) ?? new Map<string, SlotPlayer>();
      const id = s.code === null ? `name:${s.name}` : `code:${s.code}`;
      const p = players.get(id) ?? { code: s.code, name: s.name, starts: 0 };
      p.starts += 1;
      players.set(id, p);
      bySlot.set(slot, players);
    }
  }
  const slotsOf = (codes: string[]): FormationSlot[] => {
    const out: FormationSlot[] = [];
    for (const code of [...new Set(codes)].sort((a, b) => SIDE_OF(a) - SIDE_OF(b) || DEPTH_OF(a) - DEPTH_OF(b))) {
      const copies = codes.filter((c) => c === code).length;
      const ranked = [...(bySlot.get(code)?.values() ?? [])].sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name));
      for (let i = 0; i < copies; i++) out.push({ position: code, players: ranked.filter((_, j) => j % copies === i) });
    }
    return out;
  };
  const lines: FormationSlot[][] = [];
  for (let line = FORWARD_LINE; line >= 0; line--) {
    const codes = template.filter((p) => LINE_OF[p] === line);
    if (codes.length > 0) lines.push(slotsOf(codes));
  }
  lines.push(slotsOf(template.filter((p) => p === GOALKEEPER)));
  return { formation, starts: matches.length, lines };
}
