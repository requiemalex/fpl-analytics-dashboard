/**
 * Pairs FPL's clubs and fixtures with Understat's for one season — by
 * results, never by club names. Club names differ between the two ("Spurs"
 * / "Tottenham", "Nott'm Forest" / "Nottingham Forest") and would need a
 * hand-kept list; results don't: a club is the one whose fixtures have the
 * same venue, opponent and score.
 *
 * Seeds (last season's pairings, by FPL's permanent club code) settle most
 * clubs straight away and are then checked like everything else; only
 * newly promoted clubs are worked out from scratch. Every pairing is
 * verified fixture by fixture: any score that disagrees is a problem, and
 * the caller writes nothing.
 */

export interface FplTeamRef {
  /** FPL's season-specific team id (what fixtures and ledger rows use). */
  id: number;
  /** FPL's permanent club code. */
  code: number;
}

export interface FplFinishedFixture {
  id: number;
  teamH: number;
  teamA: number;
  homeGoals: number;
  awayGoals: number;
}

export interface UsResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface PairingResult {
  /** FPL team id -> Understat team id. */
  teamByFplId: Map<number, string>;
  /** FPL fixture id -> Understat match id. */
  matchByFixture: Map<number, string>;
  /** Finished FPL fixtures Understat has no result for (yet). */
  unmatchedFixtures: number[];
  /** Anything that means the pairing can't be trusted — the run must stop. */
  problems: string[];
}

const key = (h: string, a: string) => `${h}|${a}`;

export function pairClubsAndFixtures(
  fplTeams: FplTeamRef[],
  fplFixtures: FplFinishedFixture[],
  usResults: UsResult[],
  usTeamIds: string[],
  seedsByCode: Map<number, string>,
): PairingResult {
  const problems: string[] = [];
  const byPair = new Map<string, UsResult>();
  for (const r of usResults) {
    const k = key(r.homeTeamId, r.awayTeamId);
    if (byPair.has(k)) problems.push(`Understat lists two matches between the same home and away clubs (${k})`);
    byPair.set(k, r);
  }
  const codeById = new Map(fplTeams.map((t) => [t.id, t.code]));
  const fixturesByTeam = new Map<number, FplFinishedFixture[]>();
  for (const f of fplFixtures) {
    for (const t of [f.teamH, f.teamA]) fixturesByTeam.set(t, [...(fixturesByTeam.get(t) ?? []), f]);
  }

  const mapping = new Map<number, string>();
  const takenUs = new Set<string>();
  for (const t of fplTeams) {
    const seed = seedsByCode.get(t.code);
    if (seed !== undefined && usTeamIds.includes(seed) && !takenUs.has(seed)) {
      mapping.set(t.id, seed);
      takenUs.add(seed);
    }
  }

  /**
   * How many of an FPL club's finished fixtures an Understat club has an
   * identical result for: same venue, same score, and an opponent that fits
   * what's already paired (the paired club if the opponent is paired,
   * otherwise any club not yet paired).
   */
  function agreement(fplId: number, usId: string): number {
    let agree = 0;
    for (const f of fixturesByTeam.get(fplId) ?? []) {
      const home = f.teamH === fplId;
      const fplOpponent = home ? f.teamA : f.teamH;
      const knownOpponent = mapping.get(fplOpponent);
      const candidates =
        knownOpponent !== undefined
          ? [byPair.get(home ? key(usId, knownOpponent) : key(knownOpponent, usId))].filter((r): r is UsResult => r !== undefined)
          : usResults.filter((r) => (home ? r.homeTeamId === usId && !takenUs.has(r.awayTeamId) : r.awayTeamId === usId && !takenUs.has(r.homeTeamId)));
      if (candidates.some((r) => r.homeGoals === f.homeGoals && r.awayGoals === f.awayGoals)) agree += 1;
    }
    return agree;
  }

  // Unseeded clubs one at a time, the strongest agreement first, so each
  // new pairing tightens the opponent check for the rest.
  for (;;) {
    const openFpl = fplTeams.filter((t) => !mapping.has(t.id) && (fixturesByTeam.get(t.id)?.length ?? 0) > 0);
    const openUs = usTeamIds.filter((u) => !takenUs.has(u));
    if (openFpl.length === 0 || openUs.length === 0) break;
    let best: { fplId: number; usId: string; score: number } | null = null;
    for (const t of openFpl) {
      for (const u of openUs) {
        const score = agreement(t.id, u);
        if (score > 0 && (best === null || score > best.score)) best = { fplId: t.id, usId: u, score };
      }
    }
    if (!best) break;
    mapping.set(best.fplId, best.usId);
    takenUs.add(best.usId);
  }

  const matchByFixture = new Map<number, string>();
  const unmatchedFixtures: number[] = [];
  for (const f of fplFixtures) {
    const h = mapping.get(f.teamH);
    const a = mapping.get(f.teamA);
    if (h === undefined || a === undefined) {
      unmatchedFixtures.push(f.id);
      continue;
    }
    const r = byPair.get(key(h, a));
    if (!r) {
      unmatchedFixtures.push(f.id);
      continue;
    }
    if (r.homeGoals !== f.homeGoals || r.awayGoals !== f.awayGoals) {
      problems.push(
        `FPL fixture ${f.id} (club codes ${codeById.get(f.teamH)} v ${codeById.get(f.teamA)}) finished ${f.homeGoals}-${f.awayGoals}, but its Understat match ${r.id} says ${r.homeGoals}-${r.awayGoals}`,
      );
      continue;
    }
    matchByFixture.set(f.id, r.id);
  }

  // A wrong pairing (a bad seed, say) wouldn't show as a score mismatch —
  // its fixtures would just look "not on Understat yet". So each paired
  // club must have most of the fixtures both sides have played paired.
  const pairedFixtures = new Set(matchByFixture.keys());
  for (const t of fplTeams) {
    const fplCount = fixturesByTeam.get(t.id)?.length ?? 0;
    if (fplCount === 0) continue;
    const usId = mapping.get(t.id);
    if (usId === undefined) {
      problems.push(`No Understat club found for FPL club code ${t.code}`);
      continue;
    }
    const usCount = usResults.filter((r) => r.homeTeamId === usId || r.awayTeamId === usId).length;
    const paired = (fixturesByTeam.get(t.id) ?? []).filter((f) => pairedFixtures.has(f.id)).length;
    if (paired < 0.8 * Math.min(fplCount, usCount)) {
      problems.push(`FPL club code ${t.code} and Understat club ${usId} agree on only ${paired} of ${Math.min(fplCount, usCount)} results — the pairing looks wrong`);
    }
  }
  return { teamByFplId: mapping, matchByFixture, unmatchedFixtures, problems };
}
