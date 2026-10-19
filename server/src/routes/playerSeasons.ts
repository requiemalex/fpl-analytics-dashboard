import { Router } from "express";
import { COMPLETED_PLAYER_MATCHES_GZ } from "../clubHistory/completedPlayerMatches.generated.js";
import { decodePlayerMatches, playerMatchesFor, type StoredPlayerMatches } from "../clubHistory/playerMatches.js";

/**
 * GET /api/player-seasons/:code — one player's match-by-match FPL record
 * for every completed season he played in (clubHistory/playerMatches.ts),
 * by his permanent FPL `code`. Bundled with the server, so it never fails
 * for network reasons; decoded on the first request, then kept.
 */
export const playerSeasonsRouter = Router();

let stored: StoredPlayerMatches | null = null;
const loadedAt = Date.now();

function store(): StoredPlayerMatches {
  stored ??= decodePlayerMatches(COMPLETED_PLAYER_MATCHES_GZ);
  return stored;
}

playerSeasonsRouter.get("/player-seasons/:code", (req, res) => {
  const { code } = req.params;
  if (!/^\d+$/.test(code)) {
    res.status(400).json({ error: "Invalid player code" });
    return;
  }
  try {
    res.json({ data: { seasons: playerMatchesFor(store(), Number(code)) }, meta: { source: "cache", fetchedAt: loadedAt } });
  } catch (err) {
    res.status(500).json({ error: `Past-season match records unreadable: ${err instanceof Error ? err.message : String(err)}` });
  }
});
