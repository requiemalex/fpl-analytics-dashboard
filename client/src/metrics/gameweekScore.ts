import { SQUAD_RULES, type GameweekRecord } from "../types/team";
import type { Position } from "../types/normalized";

/** One player's gameweek from FPL's event live data: points and minutes, a double's matches added up. */
export interface LivePlayerGameweek {
  points: number;
  minutes: number;
}

export interface RecordedScore {
  /** The XI's points after substitutions, the captain's counted twice. */
  points: number;
  /** The points of those left on the bench. */
  benchPoints: number;
  /** Who scored double: the captain, or the vice-captain if the captain didn't play; null with neither. */
  captainId: number | null;
  /** His points, doubled. */
  captainPoints: number | null;
  /** Automatic substitutions made, each starter who didn't play and who came on for him. */
  subs: { outId: number; inId: number }[];
  /** True while the gameweek isn't finished: no substitutions yet, the captain counted as picked. */
  provisional: boolean;
}

const POSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * <gameweek_log>: a squad built in Scoutline, scored as FPL would score it
 * from its record at the deadline and every player's gameweek (FPL's event
 * live data). Once the gameweek is finished, each starter who didn't play
 * is replaced by the first benched player who did and keeps the XI legal
 * (a goalkeeper only by the goalkeeper), the bench in the order the pitch
 * shows it (goalkeeper, then defenders, midfielders, forwards: Scoutline's
 * bench has no order of its own), and if the captain didn't play the
 * vice-captain scores double. Before then it's the XI as picked.
 */
export function scoreRecord(
  record: GameweekRecord,
  live: ReadonlyMap<number, LivePlayerGameweek>,
  positionOf: (id: number) => Position | null,
  finished: boolean,
): RecordedScore {
  const pointsOf = (id: number) => live.get(id)?.points ?? 0;
  const played = (id: number) => (live.get(id)?.minutes ?? 0) > 0;
  const xi = [...record.startingXI];
  const bench = record.playerIds
    .filter((id) => !xi.includes(id))
    .sort((a, b) => POSITION_ORDER.indexOf(positionOf(a) ?? "FWD") - POSITION_ORDER.indexOf(positionOf(b) ?? "FWD"));
  const subs: RecordedScore["subs"] = [];

  if (finished) {
    const counts = (ids: number[]) => {
      const c: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const id of ids) {
        const p = positionOf(id);
        if (p) c[p] += 1;
      }
      return c;
    };
    const legal = (ids: number[]) => {
      const c = counts(ids);
      return POSITION_ORDER.every((p) => c[p] >= SQUAD_RULES.startingXIBounds[p].min);
    };
    for (const outId of record.startingXI.filter((id) => !played(id))) {
      const outIsKeeper = positionOf(outId) === "GKP";
      const inId = bench.find((id) => {
        if (!played(id) || (positionOf(id) === "GKP") !== outIsKeeper) return false;
        return legal(xi.map((x) => (x === outId ? id : x)));
      });
      if (inId === undefined) continue;
      xi[xi.indexOf(outId)] = inId;
      bench.splice(bench.indexOf(inId), 1, outId);
      subs.push({ outId, inId });
    }
  }

  const captainIn = record.captainId !== null && xi.includes(record.captainId);
  const viceIn = record.viceCaptainId !== null && xi.includes(record.viceCaptainId);
  const captainId =
    finished && captainIn && !played(record.captainId!) && viceIn && played(record.viceCaptainId!)
      ? record.viceCaptainId
      : captainIn
        ? record.captainId
        : viceIn && finished && played(record.viceCaptainId!)
          ? record.viceCaptainId
          : null;
  const xiPoints = xi.reduce((sum, id) => sum + pointsOf(id), 0);
  const captainPoints = captainId === null ? null : pointsOf(captainId) * 2;
  return {
    points: xiPoints + (captainId === null ? 0 : pointsOf(captainId)),
    benchPoints: bench.reduce((sum, id) => sum + pointsOf(id), 0),
    captainId,
    captainPoints,
    subs,
    provisional: !finished,
  };
}
