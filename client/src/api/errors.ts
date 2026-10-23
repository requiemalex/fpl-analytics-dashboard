import { ApiRequestError } from "./client";
import { SchemaValidationError } from "../validation/schema";

/**
 * <plain_errors>: what went wrong with a request, in words someone using
 * the app can act on — never an internal address or a raw status line
 * ("Request to /api/element-summary/411 failed (500)" used to be shown
 * as is; audit 2026-10-23 in-app). The technical detail goes to the
 * console, which the desktop app writes to its log, where a problem
 * report needs it.
 */
export function describeLoadError(err: unknown): string {
  console.error("Load failed:", err);
  if (err instanceof SchemaValidationError) {
    return "FPL sent its data in a form Scoutline doesn't recognise, so it can't be shown. FPL may have changed something.";
  }
  if (err instanceof ApiRequestError) {
    if (err.status === 404) return "FPL has no record of it.";
    return `FPL's servers didn't answer properly (error ${err.status}). This usually passes: try again in a moment.`;
  }
  // fetch() rejects with a TypeError when there's no connection at all.
  if (err instanceof TypeError) return "Couldn't reach FPL. Check your internet connection and try again.";
  return "Something unexpected went wrong. Try again in a moment.";
}
