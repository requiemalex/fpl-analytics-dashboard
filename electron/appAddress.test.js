// Run by `npm test` (node's own test runner: the Electron folder has no build step).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { forwardedHeaders } = require("./appAddress");

test("<forwarded_headers> a crossorigin script's Origin isn't passed on to the built-in server", () => {
  const fromPage = new Headers({ Origin: "http://localhost:4317", Accept: "*/*", "If-None-Match": 'W/"abc"' });
  const kept = forwardedHeaders(fromPage);
  assert.equal(kept.get("origin"), null);
  assert.equal(kept.get("accept"), "*/*");
  assert.equal(kept.get("if-none-match"), 'W/"abc"');
  assert.equal(fromPage.get("origin"), "http://localhost:4317", "the page's own request is left as it was");
});

test("<forwarded_headers> a request with no Origin keeps every header", () => {
  const kept = forwardedHeaders(new Headers({ Accept: "text/html", "Content-Type": "application/json" }));
  assert.deepEqual([...kept.entries()], [["accept", "text/html"], ["content-type", "application/json"]]);
});
