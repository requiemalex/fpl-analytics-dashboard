/**
 * Shared localStorage persistence for user customisation (Dashboard summary
 * tiles, saved User Analysis graphs, saved squads, and any future
 * per-browser settings). Centralised here so every consumer gets the same
 * answer to one question: what happens to a user's saved customisation when
 * an app update changes the shape of what's stored?
 *
 * <update_safety>: each store's data is wrapped in a small envelope
 * (`{ version, data }`) with its own `version` number, bumped only when a
 * later app version changes that store's shape in a way old data can't just
 * be read as-is. On load, `migrate()` gets the raw payload plus the version
 * it was stored under (`null` for data written before this envelope existed
 * — every pre-existing key in this app falls in that bucket on first read
 * after upgrading) and returns either a value shaped like the CURRENT
 * version, or `null` if the old data can't be salvaged at all. Either way,
 * loading a settings file from an older or newer app version degrades to
 * `fallback` instead of crashing downstream code that assumes the current
 * shape — the same "graceful degradation over crashes" rule this app
 * follows everywhere else (see CLAUDE.md).
 */
export interface VersionedStore<T> {
  version: number;
  fallback: T;
  migrate: (data: unknown, storedVersion: number | null) => T | null;
}

interface Envelope<T> {
  version: number;
  data: T;
}

function isEnvelope<T>(value: unknown): value is Envelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "data" in value &&
    typeof (value as { version: unknown }).version === "number"
  );
}

export function loadVersioned<T>(key: string, store: VersionedStore<T>): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return store.fallback;
    const parsed: unknown = JSON.parse(raw);
    const storedVersion = isEnvelope<T>(parsed) ? parsed.version : null;
    const payload = isEnvelope<T>(parsed) ? parsed.data : parsed;
    const migrated = store.migrate(payload, storedVersion);
    return migrated ?? store.fallback;
  } catch {
    return store.fallback;
  }
}

export function saveVersioned<T>(key: string, version: number, data: T): void {
  try {
    const envelope: Envelope<T> = { version, data };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // localStorage can throw (private browsing, quota) — state still works
    // for the rest of this session, it just won't persist on reload.
  }
}
