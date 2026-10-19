import http from "http";
import type express from "express";

/**
 * <loopback_only>: starts the app on this computer's own loopback addresses
 * only — never every network interface — so nothing else on the network
 * (public Wi-Fi included) can reach the proxy and have it make FPL requests
 * on its behalf. Express's plain `.listen(port)` binds every interface.
 *
 * Both loopbacks, because the page is loaded from `http://localhost:…` and
 * "localhost" can mean either 127.0.0.1 or ::1: 127.0.0.1 must succeed; ::1
 * is best-effort, since IPv6 can be switched off on the machine. A ::1 port
 * already taken by another program is an error, though — the browser could
 * reach that program instead of this one.
 *
 * `host` overrides it (one address only), for a container that has to
 * accept outside connections (the reference Dockerfile sets HOST=0.0.0.0).
 */
export function listenOnLoopback(app: express.Express, port: number, host?: string): Promise<void> {
  if (host) {
    return new Promise((resolve, reject) => {
      const server = http.createServer(app);
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
  }
  return new Promise((resolve, reject) => {
    const v4 = http.createServer(app);
    v4.once("error", reject);
    v4.listen(port, "127.0.0.1", () => {
      const v6 = http.createServer(app);
      v6.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          v4.close();
          reject(err);
        } else {
          resolve(); // no IPv6 loopback on this machine: 127.0.0.1 is enough
        }
      });
      v6.listen(port, "::1", () => resolve());
    });
  });
}
