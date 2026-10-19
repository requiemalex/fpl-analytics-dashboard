/**
 * The product's name and ownership, in one place — every title, notice and
 * legal line in the client reads it from here. (Until 2026-10-19 the app was
 * "FPL Analytics Dashboard"; the name dropped "FPL", a Premier League
 * trademark.) electron/main.js and package.json carry the same name for the
 * desktop app.
 */
export const APP_NAME = "Scoutline";

export const COPYRIGHT_HOLDER = "Alex Pirie";
export const COPYRIGHT_NOTICE = `© 2026 ${COPYRIGHT_HOLDER}. All rights reserved.`;

/** The app's version, from the root package.json at build time (the release workflow sets it from the tag). */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/**
 * The version of the terms (LICENSE.txt) the app asks people to accept. Change
 * it whenever LICENSE.txt changes in substance, and everyone is asked to
 * accept the new terms on their next launch (components/TermsGate.tsx).
 */
export const TERMS_VERSION = "2026-10-19";

export const SUPPORT_URL = "https://github.com/requiemalex/fpl-analytics-dashboard/issues";
