/**
 * Links FPL players (permanent `code`) to Understat players, one season at
 * a time. Two independent signals have to agree before a link is
 * confirmed:
 *
 *  - the appearance fingerprint: of the paired matches either side says a
 *    player appeared in, the share where BOTH do (minutes within
 *    APPEARANCE_MINUTES_TOLERANCE — FPL counts stoppage time and Understat
 *    doesn't, so a substitute's minutes legitimately differ);
 *  - the name (names.ts).
 *
 * Tested against three seasons (2021/22, 2022/23 graded against vaastav's
 * mapping, and 2026/27): every player linked, none wrong. Matching on names
 * alone gets 2–3% wrong (both Arsenal Gabriels, Ben White, Thiago…).
 *
 * <links_are_kept>: a confirmed link is never re-made from scratch, which
 * could flip it. It is re-checked against every season it has data for;
 * one that stops agreeing becomes "disputed" (hidden from the app, and
 * alerted) rather than silently re-pointed. Anything uncertain is "held":
 * the app shows "—" for it, never a guess.
 */
import { nameScore, type FplName } from "./names.js";
import type { LinkOverride, PlayerLink } from "./types.js";

export const APPEARANCE_MINUTES_TOLERANCE = 20;
/** An appearance this short that the other side doesn't list is too uncertain to count either way (a stoppage-time cameo). */
const CAMEO_MINUTES = 5;
const CONFIRM_FINGERPRINT = 0.8;
const CONFIRM_NAME = 0.75;
/** The best candidate must beat the runner-up by this much on the combined score. */
const CONFIRM_MARGIN = 0.1;

export interface FplPlayerSeason {
  code: number;
  name: FplName;
  /** FPL fixture id -> minutes, for every fixture the player has a ledger row for. */
  minutesByFixture: Map<number, number>;
  /** FPL team id(s) he played for this season (a mid-season mover has two). */
  teamIds: Set<number>;
}

export interface UsPlayerSeason {
  id: string;
  name: string;
  /** Understat match id -> minutes. */
  minutesByMatch: Map<string, number>;
  teamIds: Set<string>;
}

export interface Fingerprint {
  /** 0–1: agreeing appearances / appearances either side lists. */
  agreement: number;
  appearances: number;
  mismatches: number;
}

export function fingerprint(fpl: Map<number, number>, us: Map<string, number>, matchByFixture: Map<number, string>): Fingerprint {
  const paired = new Set(matchByFixture.values());
  const fplApps = new Map<string, number>();
  for (const [fixture, minutes] of fpl) {
    const match = matchByFixture.get(fixture);
    if (match !== undefined && minutes > 0) fplApps.set(match, minutes);
  }
  const usApps = new Map<string, number>();
  for (const [match, minutes] of us) if (minutes > 0 && paired.has(match)) usApps.set(match, minutes);
  let agree = 0;
  let considered = 0;
  for (const match of new Set([...fplApps.keys(), ...usApps.keys()])) {
    const f = fplApps.get(match);
    const u = usApps.get(match);
    if (f !== undefined && u !== undefined) {
      considered += 1;
      if (Math.abs(f - u) <= APPEARANCE_MINUTES_TOLERANCE) agree += 1;
    } else if ((f ?? u ?? 0) > CAMEO_MINUTES) {
      considered += 1;
    }
  }
  return { agreement: considered === 0 ? 0 : agree / considered, appearances: considered, mismatches: considered - agree };
}

/** A saved link still fits a season if at most one appearance (or a fifth of them) disagrees. */
export function stillAgrees(fp: Fingerprint): boolean {
  return fp.mismatches <= Math.max(1, Math.floor(fp.appearances * 0.2));
}

export interface LinkSeasonInput {
  season: string;
  today: string;
  fpl: FplPlayerSeason[];
  us: UsPlayerSeason[];
  matchByFixture: Map<number, string>;
  teamByFplId: Map<number, string>;
  links: Map<number, PlayerLink>;
  overrides: LinkOverride[];
}

export interface LinkSeasonResult {
  links: Map<number, PlayerLink>;
  /** Plain-English lines for the run report. */
  events: string[];
}

const fullName = (n: FplName) => `${n.first} ${n.second}`.trim();

export function linkSeason(input: LinkSeasonInput): LinkSeasonResult {
  const { season, today, fpl, us, matchByFixture, teamByFplId, overrides } = input;
  const links = new Map(input.links);
  const events: string[] = [];
  const usById = new Map(us.map((u) => [u.id, u]));
  const never = new Set(overrides.filter((o) => o.action === "never").map((o) => `${o.fplCode}|${o.understatId}`));
  const forced = new Map(overrides.filter((o) => o.action === "pair").map((o) => [o.fplCode, o]));
  // Understat players already spoken for by another FPL player's confirmed or disputed link.
  const claimedBy = new Map<string, number>();
  for (const l of links.values()) if (l.status !== "held") claimedBy.set(l.understatId, l.fplCode);
  for (const o of forced.values()) claimedBy.set(o.understatId, o.fplCode);

  const appearedFpl = fpl.filter((p) => [...p.minutesByFixture.entries()].some(([fx, m]) => m > 0 && matchByFixture.has(fx)));
  const setLink = (code: number, link: Omit<PlayerLink, "since">) => {
    const prev = links.get(code);
    // A held player's best candidate can change between runs; he has still been held since he was first held.
    const unchanged = prev && prev.status === link.status && (link.status === "held" || prev.understatId === link.understatId);
    links.set(code, { ...link, since: unchanged ? prev.since : today });
  };

  const unresolved: FplPlayerSeason[] = [];
  for (const p of appearedFpl) {
    const override = forced.get(p.code);
    const existing = links.get(p.code);
    if (override) {
      const u = usById.get(override.understatId);
      const fp = u ? fingerprint(p.minutesByFixture, u.minutesByMatch, matchByFixture) : null;
      if (fp && fp.appearances >= 3 && fp.agreement < 0.5) {
        events.push(`Manual link for ${fullName(p.name)} looks wrong in ${season}: only ${fp.appearances - fp.mismatches} of ${fp.appearances} appearances agree.`);
      }
      setLink(p.code, {
        fplCode: p.code,
        understatId: override.understatId,
        status: "confirmed",
        fplName: fullName(p.name),
        understatName: u?.name ?? existing?.understatName ?? "",
        season: existing?.season ?? season,
        note: `manual: ${override.note}`,
      });
      continue;
    }
    if (existing && existing.status !== "held") {
      const u = usById.get(existing.understatId);
      if (!u) {
        // Linked, but his Understat id has no appearances this season while FPL says he played.
        const fp = fingerprint(p.minutesByFixture, new Map(), matchByFixture);
        if (fp.appearances > 1 && existing.status === "confirmed") {
          setLink(p.code, { ...existing, status: "disputed", note: `${season}: FPL lists ${fp.appearances} appearances, Understat none for this player` });
          events.push(`Disputed: ${existing.fplName} — FPL lists ${fp.appearances} appearances in ${season}, Understat none.`);
        }
        continue;
      }
      const fp = fingerprint(p.minutesByFixture, u.minutesByMatch, matchByFixture);
      if (!stillAgrees(fp)) {
        if (existing.status === "confirmed") {
          setLink(p.code, { ...existing, status: "disputed", note: `${season}: only ${fp.appearances - fp.mismatches} of ${fp.appearances} appearances agree` });
          events.push(`Disputed: ${existing.fplName} ↔ ${existing.understatName} — only ${fp.appearances - fp.mismatches} of ${fp.appearances} appearances agree in ${season}.`);
        }
      } else if (existing.status === "disputed" && existing.note.startsWith(`${season}:`)) {
        setLink(p.code, { ...existing, status: "confirmed", note: `${season}: agrees again` });
        events.push(`Resolved: ${existing.fplName} ↔ ${existing.understatName} agree again in ${season}.`);
      }
      continue;
    }
    unresolved.push(p);
  }

  interface Candidate {
    p: FplPlayerSeason;
    u: UsPlayerSeason;
    fp: Fingerprint;
    name: number;
    score: number;
  }
  const best = new Map<number, { top: Candidate; margin: number }>();
  for (const p of unresolved) {
    const candidateIds = new Set<string>();
    for (const [fx, m] of p.minutesByFixture) {
      const match = matchByFixture.get(fx);
      if (m <= 0 || match === undefined) continue;
      for (const u of us) if ((u.minutesByMatch.get(match) ?? 0) > 0) candidateIds.add(u.id);
    }
    const scored: Candidate[] = [];
    for (const id of candidateIds) {
      if (claimedBy.has(id) || never.has(`${p.code}|${id}`)) continue;
      const u = usById.get(id)!;
      const fp = fingerprint(p.minutesByFixture, u.minutesByMatch, matchByFixture);
      const name = nameScore(p.name, u.name);
      scored.push({ p, u, fp, name, score: 0.6 * fp.agreement + 0.4 * name });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 0) best.set(p.code, { top: scored[0], margin: scored[0].score - (scored[1]?.score ?? 0) });
  }

  // Two FPL players wanting the same Understat player: neither is confirmed.
  const wanted = new Map<string, number>();
  for (const { top } of best.values()) wanted.set(top.u.id, (wanted.get(top.u.id) ?? 0) + 1);

  const stillOpen: FplPlayerSeason[] = [];
  for (const p of unresolved) {
    const b = best.get(p.code);
    if (!b) {
      stillOpen.push(p);
      continue;
    }
    const { top, margin } = b;
    const contested = (wanted.get(top.u.id) ?? 0) > 1;
    if (!contested && top.fp.agreement >= CONFIRM_FINGERPRINT && top.name >= CONFIRM_NAME && margin >= CONFIRM_MARGIN) {
      setLink(p.code, {
        fplCode: p.code,
        understatId: top.u.id,
        status: "confirmed",
        fplName: fullName(p.name),
        understatName: top.u.name,
        season: links.get(p.code)?.season ?? season,
        note: `${season}: names and ${top.fp.appearances} appearances agree`,
      });
      claimedBy.set(top.u.id, p.code);
      events.push(`Linked: ${fullName(p.name)} ↔ ${top.u.name}.`);
    } else {
      stillOpen.push(p);
    }
  }

  // <only_one_left>: at a club where exactly one FPL player and one
  // Understat player are still unlinked, and every appearance agrees, they
  // are the same player whatever the names say (Jean-Mattéo Bahoya is
  // "Jean Négoce" on Understat).
  const open = new Set(stillOpen.map((p) => p.code));
  for (const p of stillOpen) {
    let linked = false;
    for (const fplTeam of p.teamIds) {
      const usTeam = teamByFplId.get(fplTeam);
      if (usTeam === undefined) continue;
      const openHere = stillOpen.filter((q) => open.has(q.code) && q.teamIds.has(fplTeam));
      const usOpenHere = us.filter((u) => u.teamIds.has(usTeam) && !claimedBy.has(u.id) && [...u.minutesByMatch.values()].some((m) => m > 0));
      if (openHere.length !== 1 || usOpenHere.length !== 1) continue;
      const u = usOpenHere[0];
      if (never.has(`${p.code}|${u.id}`)) continue;
      const fp = fingerprint(p.minutesByFixture, u.minutesByMatch, matchByFixture);
      if (fp.agreement === 1 && fp.appearances >= 2) {
        setLink(p.code, {
          fplCode: p.code,
          understatId: u.id,
          status: "confirmed",
          fplName: fullName(p.name),
          understatName: u.name,
          season: links.get(p.code)?.season ?? season,
          note: `${season}: the only unlinked player left at his club; all ${fp.appearances} appearances agree`,
        });
        claimedBy.set(u.id, p.code);
        open.delete(p.code);
        events.push(`Linked (only one left at his club): ${fullName(p.name)} ↔ ${u.name}.`);
        linked = true;
        break;
      }
    }
    if (linked) continue;
    const b = best.get(p.code);
    const prev = links.get(p.code);
    const candidate = b?.top.u;
    setLink(p.code, {
      fplCode: p.code,
      understatId: candidate?.id ?? "",
      status: "held",
      fplName: fullName(p.name),
      understatName: candidate?.name ?? "",
      season: prev?.season ?? season,
      note: candidate
        ? `${season}: best candidate ${candidate.name} — appearances ${b!.top.fp.appearances - b!.top.fp.mismatches}/${b!.top.fp.appearances}, name ${b!.top.name.toFixed(2)}, lead ${b!.margin.toFixed(2)}`
        : `${season}: no Understat candidate yet`,
    });
    if (!prev || prev.status !== "held") events.push(`Held (shown as "—" until certain): ${fullName(p.name)}${candidate ? ` — best candidate ${candidate.name}` : ""}.`);
  }

  return { links, events };
}
