import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import http from "http";
import { networkInterfaces } from "os";
import { listenOnLoopback } from "./listen";

function get(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: "/ping", timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

const app = express();
app.get("/ping", (_req, res) => res.send("ok"));
let port = 0;

afterEach(() => {
  port = 0;
});

describe("<loopback_only>: listenOnLoopback", () => {
  it("answers on this computer's loopback, but not on its network address", async () => {
    port = 40000 + Math.floor(Math.random() * 20000);
    await listenOnLoopback(app, port);
    expect(await get("127.0.0.1", port)).toBe(200);
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    if (lan) await expect(get(lan, port)).rejects.toThrow();
  });

  it("reports a port another program already has, rather than starting half-way", async () => {
    port = 40000 + Math.floor(Math.random() * 20000);
    const blocker = http.createServer().listen(port, "127.0.0.1");
    await new Promise((r) => blocker.once("listening", r));
    await expect(listenOnLoopback(app, port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    blocker.close();
  });
});
