import Fastify from "fastify";
import { productionAppMounts, registerStaticApps } from "../apps/backend/dist/static-apps.js";

const mounts = productionAppMounts();
if (mounts.length !== 4) {
  throw new Error(`Expected four built apps, found ${mounts.length}.`);
}

const app = Fastify();
app.get("/api/v1/deployment-check", async () => ({ ok: true }));
registerStaticApps(app, mounts);

try {
  for (const mount of mounts) {
    const root = await app.inject({ method: "GET", url: mount.base });
    if (root.statusCode !== 200 || !root.body.includes("<html")) {
      throw new Error(`${mount.id} root failed (${root.statusCode}) at ${mount.base}`);
    }

    const deepLink = await app.inject({
      method: "GET",
      url: `${mount.base}deployment-smoke`,
      headers: { accept: "text/html" },
    });
    if (deepLink.statusCode !== 200 || deepLink.body !== root.body) {
      throw new Error(`${mount.id} deep link failed (${deepLink.statusCode}).`);
    }

    const asset = root.body.match(/(?:src|href)="([^"]+\.(?:js|css))"/)?.[1];
    if (!asset) throw new Error(`${mount.id} HTML has no built JavaScript or stylesheet asset.`);
    const assetResponse = await app.inject({ method: "GET", url: asset });
    if (assetResponse.statusCode !== 200) {
      throw new Error(`${mount.id} asset failed (${assetResponse.statusCode}): ${asset}`);
    }
    console.log(`Verified ${mount.id}: ${mount.base} and deep-link fallback`);
  }

  const removedApp = await app.inject({
    method: "GET",
    url: "/tournament-admin/",
    headers: { accept: "text/html" },
  });
  if (removedApp.statusCode !== 404) {
    throw new Error(`Removed Tournament-admin path should return 404 (${removedApp.statusCode}).`);
  }
  console.log("Verified removed Tournament-admin path returns 404.");

  const api = await app.inject({ method: "GET", url: "/api/v1/deployment-check" });
  if (api.statusCode !== 200 || api.json().ok !== true) {
    throw new Error(`API route was not preserved (${api.statusCode}).`);
  }
  console.log("Verified API route remains reachable.");
} finally {
  await app.close();
}
