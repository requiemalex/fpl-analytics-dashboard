import type { ApiEnvelope, RawBootstrapStatic, RawElementSummary, RawFixture, RawHistoricBulk, RawEntryTeam, RawEntryHistory, RawEntryPicks } from "../types/raw";
import { elementSummarySchema, fixturesSchema, historicBulkSchema, entryTeamSchema, entryHistorySchema, entryPicksSchema, validate, parseBootstrapStatic } from "../validation/schema";

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function getEnvelope<TRaw>(path: string): Promise<ApiEnvelope<TRaw>> {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError((body as { error?: string }).error ?? `Request to ${path} failed (${res.status})`, res.status);
  }
  return body as ApiEnvelope<TRaw>;
}

async function postEnvelope<TRaw>(path: string): Promise<ApiEnvelope<TRaw>> {
  const res = await fetch(path, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError((body as { error?: string }).error ?? `Request to ${path} failed (${res.status})`, res.status);
  }
  return body as ApiEnvelope<TRaw>;
}

export interface FetchResult<T> {
  data: T;
  source: "live" | "cache" | "stale-cache";
  fetchedAt: number;
}

export async function fetchBootstrap(opts?: { forceRefresh?: boolean }): Promise<FetchResult<RawBootstrapStatic> & { skippedElementCount: number }> {
  const envelope = opts?.forceRefresh
    ? await postEnvelope<unknown>("/api/refresh/bootstrap-static")
    : await getEnvelope<unknown>("/api/bootstrap-static");
  // Per-element validation: one malformed player record is dropped and
  // counted, not a whole-app failure — see parseBootstrapStatic's doc comment.
  const { bootstrap, skippedElementCount } = parseBootstrapStatic(envelope.data);
  const data = bootstrap as unknown as RawBootstrapStatic;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt, skippedElementCount };
}

export async function fetchFixtures(opts?: { forceRefresh?: boolean }): Promise<FetchResult<RawFixture[]>> {
  const envelope = opts?.forceRefresh ? await postEnvelope<unknown>("/api/refresh/fixtures") : await getEnvelope<unknown>("/api/fixtures");
  const data = validate(fixturesSchema, envelope.data, "fixtures") as unknown as RawFixture[];
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}

export async function fetchElementSummary(playerId: number, opts?: { forceRefresh?: boolean }): Promise<FetchResult<RawElementSummary>> {
  const path = opts?.forceRefresh ? `/api/refresh/element-summary/${playerId}` : `/api/element-summary/${playerId}`;
  const envelope = opts?.forceRefresh ? await postEnvelope<unknown>(path) : await getEnvelope<unknown>(path);
  const data = validate(elementSummarySchema, envelope.data, `element-summary/${playerId}`) as unknown as RawElementSummary;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}

/**
 * The whole-pool historic dataset. A cold build costs the server several
 * hundred individual upstream requests (see server/src/routes/
 * historicBulk.ts), so this request can legitimately take tens of seconds
 * the first time; it's cached server-side afterwards. Callers should show
 * a patient loading state, not a short timeout.
 */
export async function fetchHistoricBulk(opts?: { forceRefresh?: boolean }): Promise<FetchResult<RawHistoricBulk>> {
  const path = opts?.forceRefresh ? "/api/refresh/historic-bulk" : "/api/historic-bulk";
  const envelope = opts?.forceRefresh ? await postEnvelope<unknown>(path) : await getEnvelope<unknown>(path);
  const data = validate(historicBulkSchema, envelope.data, "historic-bulk") as unknown as RawHistoricBulk;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}

/**
 * Real-manager data for the Load-from-FPL feature — three separate
 * requests (team identity/bank, chip/season history, one gameweek's
 * picks), matching the three separate upstream endpoints. Throws
 * ApiRequestError with a 400 if the team ID itself is malformed (caught
 * server-side before ever reaching the upstream API), or whatever status
 * the upstream API itself returns for an ID that doesn't exist.
 */
export async function fetchEntryTeam(teamId: number): Promise<FetchResult<RawEntryTeam>> {
  const envelope = await getEnvelope<unknown>(`/api/entry/${teamId}`);
  const data = validate(entryTeamSchema, envelope.data, "entry team") as unknown as RawEntryTeam;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}

export async function fetchEntryHistory(teamId: number): Promise<FetchResult<RawEntryHistory>> {
  const envelope = await getEnvelope<unknown>(`/api/entry/${teamId}/history`);
  const data = validate(entryHistorySchema, envelope.data, "entry history") as unknown as RawEntryHistory;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}

export async function fetchEntryPicks(teamId: number, eventId: number): Promise<FetchResult<RawEntryPicks>> {
  const envelope = await getEnvelope<unknown>(`/api/entry/${teamId}/event/${eventId}/picks`);
  const data = validate(entryPicksSchema, envelope.data, "entry picks") as unknown as RawEntryPicks;
  return { data, source: envelope.meta.source, fetchedAt: envelope.meta.fetchedAt };
}
