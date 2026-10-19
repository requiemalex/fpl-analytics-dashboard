import { useCallback, useEffect, useState } from "react";
import { fetchPlayerSeasons } from "../api/client";
import type { PlayerPastMatch } from "../types/normalized";

type State =
  | { status: "idle" | "loading" }
  | { status: "error"; errorMessage: string }
  | { status: "ready"; seasons: Record<string, PlayerPastMatch[]> };

/**
 * A player's match rows for his completed seasons (the profile's Match Log
 * when a past season is picked), fetched only once `enabled` — the first
 * time a past season is picked — and kept for that player. Every result is
 * tied to the player it was fetched for, so another player's rows are never
 * shown, even for a moment after switching.
 */
export function usePlayerPastSeasons(code: number | null, enabled: boolean): State & { retry: () => void } {
  const [held, setHeld] = useState<{ code: number; state: State } | null>(null);
  const state: State = held && held.code === code ? held.state : { status: "idle" };

  const load = useCallback((c: number) => {
    setHeld({ code: c, state: { status: "loading" } });
    fetchPlayerSeasons(c)
      .then((result) => setHeld((prev) => (prev?.code === c ? { code: c, state: { status: "ready", seasons: result.data } } : prev)))
      .catch((err) =>
        setHeld((prev) => (prev?.code === c ? { code: c, state: { status: "error", errorMessage: err instanceof Error ? err.message : String(err) } } : prev)),
      );
  }, []);

  useEffect(() => {
    if (enabled && code !== null && state.status === "idle") load(code);
  }, [enabled, code, state.status, load]);

  return { ...state, retry: () => code !== null && load(code) };
}
