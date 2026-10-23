/**
 * <forwarded_headers>: the headers a request to the app's address keeps
 * when answerAppAddress (main.js) passes it on to the built-in server.
 *
 * Everything except `Origin`. The page loads its script and stylesheet as
 * `crossorigin` (Vite writes them that way), so the browser sends its own
 * address, http://localhost:4317, as their Origin. Passed on as it was,
 * that turned the hop to the built-in server (another address,
 * 127.0.0.1:<port>) into a cross-origin request, which Electron's
 * net.fetch refused (net::ERR_FAILED) because the server doesn't answer
 * with CORS headers: the page arrived without its script and stayed blank
 * (v1.101.0, audit 2026-10-23 in-app C1). Both ends are the app itself, so
 * there's nothing for Origin to protect.
 */
function forwardedHeaders(headers) {
  const kept = new Headers(headers);
  kept.delete("origin");
  return kept;
}

module.exports = { forwardedHeaders };
