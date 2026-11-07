import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerStaticApps } from "../src/static-apps.js";

describe("production app hosting", () => {
  it("serves app assets and deep links without intercepting API routes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hema-static-"));
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<main>app shell</main>");
    await writeFile(path.join(root, "assets", "main.js"), "console.log('app');");
    const app = Fastify();
    app.get("/api/v1/health", async () => ({ ok: true }));
    registerStaticApps(app, [{ id: "sample", base: "/sample/", root }]);

    try {
      const home = await app.inject({ method: "GET", url: "/sample/" });
      expect(home.statusCode).toBe(200);
      expect(home.body).toContain("app shell");
      expect(home.headers["cache-control"]).toContain("max-age=0");

      const deepLink = await app.inject({
        method: "GET",
        url: "/sample/ring/token",
        headers: { accept: "text/html" },
      });
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain("app shell");

      const asset = await app.inject({ method: "GET", url: "/sample/assets/main.js" });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain("console.log");

      const missingAsset = await app.inject({
        method: "GET",
        url: "/sample/assets/missing.js",
        headers: { accept: "text/html" },
      });
      expect(missingAsset.statusCode).toBe(404);

      const noSlash = await app.inject({ method: "GET", url: "/sample", headers: { accept: "text/html" } });
      expect(noSlash.statusCode).toBe(200);
      expect(noSlash.body).toContain("app shell");

      const api = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(api.statusCode).toBe(200);
      expect(api.json()).toEqual({ ok: true });
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
