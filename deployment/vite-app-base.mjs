import { readFileSync } from "node:fs";
import path from "node:path";

const deployment = JSON.parse(readFileSync(path.resolve(process.cwd(), "../../deployment/apps.json"), "utf8"));

export function appBase(id) {
  const app = deployment.apps.find((candidate) => candidate.id === id);
  if (!app) throw new Error(`Unknown deployment app: ${id}`);
  if (typeof app.base !== "string" || !app.base.startsWith("/") || !app.base.endsWith("/")) {
    throw new Error(`Invalid deployment base for app: ${id}`);
  }
  return app.base;
}
