import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { APP_ROOT } from "./app-root.js";

export interface StaticAppMount {
  id: string;
  base: string;
  root: string;
}

interface AppDeployment {
  id: string;
  base: string;
  directory: string;
}

export function appPaths(): Pick<AppDeployment, "id" | "base">[] {
  return readDeployment().apps.map(({ id, base }) => ({ id, base }));
}

export function productionAppMounts(): StaticAppMount[] {
  return readDeployment().apps.map((app) => {
    const root = path.resolve(APP_ROOT, "../", app.directory, "dist");
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Production build for ${app.id} is missing: ${root}`);
    }
    if (!statSync(path.join(root, "index.html"), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Production entry point for ${app.id} is missing: ${path.join(root, "index.html")}`);
    }
    return { id: app.id, base: app.base, root };
  });
}

function readDeployment(): { apps: AppDeployment[] } {
  const configPath = path.resolve(APP_ROOT, "../../deployment/apps.json");
  return JSON.parse(readFileSync(configPath, "utf8")) as { apps: AppDeployment[] };
}

export function registerStaticApps(app: FastifyInstance, mounts: readonly StaticAppMount[]): void {
  for (const mount of mounts) {
    const base = normalizeBase(mount.base);
    const baseWithoutSlash = base.slice(0, -1);
    app.register(async (scope) => {
      await scope.register(fastifyStatic, {
        root: mount.root,
        prefix: "/",
        wildcard: false,
        maxAge: 0,
        immutable: false,
        setHeaders: (response, filePath) => {
          if (path.basename(filePath) === "index.html") response.setHeader("Cache-Control", "no-cache");
        },
      });
      scope.setNotFoundHandler((request, reply) => sendSpaFallback(request, reply, mount));
    }, { prefix: baseWithoutSlash });
  }
}

async function sendSpaFallback(request: FastifyRequest, reply: FastifyReply, mount: StaticAppMount) {
  const base = normalizeBase(mount.base);
  const pathname = request.url.split("?", 1)[0] ?? "/";
  const relativePath = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
  if (request.method === "GET" && acceptsHtml && path.extname(relativePath) === "") {
    reply.header("Cache-Control", "no-cache");
    return reply.type("text/html").sendFile("index.html");
  }
  return reply.code(404).send({ error: "Not Found" });
}

function normalizeBase(base: string): string {
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
