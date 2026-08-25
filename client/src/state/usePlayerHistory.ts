import { useEffect, useRef, useState } from "react";
import { fetchElementSummary } from "../api/client";
import { normalizeElementSummary, normalizeSeasonHistory } from "../normalize/normalizeElementSummary";
import type { PlayerGameweekHistory, PlayerSeasonHistory } from "../types/normalized";

interface State {
  status: "idle" | "loading" | "ready" | "error";
  history: PlayerGameweekHistory[];
  seasonHistory: PlayerSeasonHistory[];
  errorMessage: string | null;
  retry: () => void;
}

const IDLE_STATE: Omit<State, "retry"> = { status: "idle", history: [], seasonHistory: [], errorMessage: null };

/** How many times to retry automatically before actually showing an error — and how long to wait between attempts. Only for genuine network-level failures ("Failed to fetch" — the request never reached a server at all), not HTTP error responses, which usually mean retrying won't help. */
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1200;

/** True for a raw browser fetch failure (network-level — DNS, connection refused, CORS block, tab backgrounded mid-request) as opposed to a real HTTP error response, which has its own message via ApiRequestError and isn't worth blindly retrying. */
function isTransientNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch/i.test(err.message);
}

/**
 * Lazily fetches a player's current-season gameweek history AND prior-
 * season career history when a player profile is opened — both come from
 * the same element-summary request, so this adds no extra network call.
 * Guards against the classic race condition: if the player id changes
 * before a request resolves, the stale response is discarded rather than
 * overwriting the newly-selected player's state.
 *
 * A transient network-level failure ("Failed to fetch" — the request
 * never reached a server at all, as opposed to a real HTTP error
 * response) is retried automatically, with a short delay, before ever
 * surfacing as an error — most one-off blips (a momentary local dev-
 * server restart, a Wi-Fi drop, a backgrounded tab losing its
 * connection) resolve within a couple of seconds and this recovers
 * silently. If every retry still fails, or the failure is a genuine
 * HTTP error rather than a network one, the error state includes a
 * manual `retry()` the caller can offer too.
 */
export function usePlayerHistory(playerId: number | null): State {
  const [state, setState] = useState<Omit<State, "retry">>(IDLE_STATE);
  const requestedIdRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  function load(id: number) {
    requestedIdRef.current = id;
    setState({ status: "loading", history: [], seasonHistory: [], errorMessage: null });

    function attempt() {
      fetchElementSummary(id)
        .then((result) => {
          if (requestedIdRef.current !== id) return; // a different player was selected meanwhile — discard
          setState({
            status: "ready",
            history: normalizeElementSummary(result.data),
            seasonHistory: normalizeSeasonHistory(result.data),
            errorMessage: null,
          });
        })
        .catch((err) => {
          if (requestedIdRef.current !== id) return;
          if (isTransientNetworkError(err) && attemptRef.current < MAX_AUTO_RETRIES) {
            attemptRef.current++;
            setTimeout(() => {
              if (requestedIdRef.current === id) attempt();
            }, RETRY_DELAY_MS);
            return;
          }
          setState({ status: "error", history: [], seasonHistory: [], errorMessage: (err as Error).message });
        });
    }
    attempt();
  }

  useEffect(() => {
    if (playerId === null) {
      setState(IDLE_STATE);
      return;
    }
    attemptRef.current = 0;
    load(playerId);
  }, [playerId]);

  function retry() {
    if (playerId === null) return;
    attemptRef.current = 0;
    load(playerId);
  }

  return { ...state, retry };
}
