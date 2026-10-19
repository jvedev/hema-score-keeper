#!/usr/bin/env node

import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// De workspace-root is niet altijd de git-root: in dit project staat de root package.json met de
// "workspaces" globs onder js/. Zoek hem op in plaats van vier niveaus omhoog te gokken.
const repoRoot = findWorkspaceRoot(path.resolve(__dirname, "..", "..", "..", ".."));

function findWorkspaceRoot(gitRoot) {
  const candidates = [gitRoot, ...fs
    .readdirSync(gitRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(gitRoot, entry.name))];

  for (const dir of candidates) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      if (JSON.parse(fs.readFileSync(pkgPath, "utf8")).workspaces) return dir;
    } catch {
      // onleesbare package.json: negeren, volgende kandidaat proberen
    }
  }
  return gitRoot;
}

const LOG_DIR = path.join(os.tmpdir(), "quick-mcp-test-dev-services");
fs.mkdirSync(LOG_DIR, { recursive: true });

function isWindows() {
  return process.platform === "win32";
}

function logPath(name) {
  return path.join(LOG_DIR, `${name}.log`);
}

// On Windows, npm itself is npm.cmd - a batch file, which needs its own cmd.exe
// to interpret. That nested cmd.exe has no console to inherit from a
// windowsHide'd/CREATE_NO_WINDOW parent, so Windows allocates it a brand new
// (visible) one - windowsHide on our own spawn only suppresses OUR immediate
// child's console, not a grandchild's. Running npm's actual JS CLI directly
// through node.exe (the same binary running this script) removes that nested
// cmd.exe/.cmd layer entirely, so there's nothing left to pop a window.
function resolveNpmCliScript() {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return fs.existsSync(candidate) ? candidate : null;
}

const npmCliScript = isWindows() ? resolveNpmCliScript() : null;

function spawnNpm(args, options) {
  if (npmCliScript) {
    return spawn(process.execPath, [npmCliScript, ...args], options);
  }
  // Fallback (non-Windows, or an npm install layout without a co-located
  // npm-cli.js): plain npm, shell-wrapped only where actually needed.
  return spawn("npm", args, { ...options, shell: isWindows() });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// --- generic service discovery ---
// No hardcoded service list: every npm workspace with a "dev" or "start"
// script AND a network port we can find in its own source is treated as a
// service. A package whose dev/start script doesn't bind a port (e.g. a
// library's watch-build script) is simply not a "service" and gets skipped -
// there's nothing to health-check or stop for it. This means a newly added
// workspace package is picked up automatically, with no edit to this script.

function listWorkspaceDirs(globs) {
  const dirs = [];
  for (const glob of globs) {
    if (glob.endsWith("/*")) {
      const baseDir = path.join(repoRoot, glob.slice(0, -2));
      if (!fs.existsSync(baseDir)) continue;
      for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(path.join(baseDir, entry.name));
      }
    } else {
      const dir = path.join(repoRoot, glob);
      if (fs.existsSync(dir)) dirs.push(dir);
    }
  }
  return dirs;
}

// Best-effort: scan a package's Vite config and top-level src/*.ts(js) files
// for a literal `.listen(PORT)` (Express-style) or `port: PORT` (Vite-style)
// number. Not a full parser - just enough to find what this repo's services
// already do, without hardcoding which package uses which pattern.
function guessPortFromSource(dir) {
  const filesToScan = [];
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mjs"]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) filesToScan.push(candidate);
  }
  const srcDir = path.join(dir, "src");
  if (fs.existsSync(srcDir)) {
    for (const file of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (file.isFile() && /\.(ts|js|mjs)$/.test(file.name)) {
        filesToScan.push(path.join(srcDir, file.name));
      }
    }
  }

  for (const file of filesToScan) {
    const text = fs.readFileSync(file, "utf8");
    const listenMatch = text.match(/\.listen\(\s*(\d{2,5})\b/);
    if (listenMatch) return Number(listenMatch[1]);
    const portFieldMatch = text.match(/\bport\s*:\s*(\d{2,5})\b/i);
    if (portFieldMatch) return Number(portFieldMatch[1]);
  }
  return undefined;
}

function discoverServices() {
  const rootPkg = readJson(path.join(repoRoot, "package.json"));
  const dirs = listWorkspaceDirs(rootPkg.workspaces || []);
  const services = [];

  for (const dir of dirs) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;

    const pkg = readJson(pkgPath);
    const scripts = pkg.scripts || {};
    // Prefer "dev" (usually watch mode - auto-reloads on the edit you're
    // testing) and fall back to "start" if that's all a package offers.
    const scriptName = ["dev", "start"].find((candidate) => scripts[candidate]);
    if (!scriptName) continue;

    const port = guessPortFromSource(dir);
    if (!port) continue; // no discoverable network port -> not a "service" to manage

    services.push({
      name: pkg.name || path.basename(dir),
      workspaceName: pkg.name,
      npmScript: scriptName,
      command: scripts[scriptName],
      dir,
      port,
      healthPath: "/health",
      timeoutMs: 20000,
    });
  }

  return services;
}

// Resolves an installed package's real executable JS file from its own
// package.json "bin" field (walking up from `fromDir` to find a hoisted
// node_modules/<name>, same resolution npm workspaces itself relies on).
function resolveBinEntry(fromDir, commandName) {
  let dir = fromDir;
  while (true) {
    const pkgDir = path.join(dir, "node_modules", commandName);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = readJson(pkgJsonPath);
      let bin = pkg.bin;
      if (bin && typeof bin === "object") bin = bin[commandName] ?? Object.values(bin)[0];
      if (typeof bin === "string") return path.join(pkgDir, bin);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Builds the actual spawn() command/args for a service's dev/start script.
//
// On Windows, "npm run <script>" - even routed through npm's own JS CLI
// instead of npm.cmd - still shells out to cmd.exe internally to run the
// script string, and that internal cmd.exe has no console to inherit from a
// windowsHide'd parent, so Windows opens it a brand new (visible) one. The
// only way to avoid that nested shell entirely is to not go through "npm run"
// for the long-running process at all: parse the script's own command (e.g.
// "tsx watch src/server.ts") and, for a simple `<bin> <args...>` shape, run
// that bin's real JS entry point directly via node.exe - the same binary
// already running this script, with nothing shell-related left in the chain.
function buildSpawnPlan(service) {
  const tokens = service.command.trim().split(/\s+/);
  const [commandName, ...args] = tokens;

  if (isWindows()) {
    const binEntry = resolveBinEntry(service.dir, commandName);
    if (binEntry) {
      return { command: process.execPath, args: [binEntry, ...args] };
    }
  }

  // POSIX (no nested-console problem there), or bin resolution failed for
  // some reason: fall back to letting npm run the script itself.
  return { command: null, args: ["run", service.npmScript, `--workspace=${service.workspaceName}`], useNpmRun: true };
}

// --- readiness probes ---

function httpProbe(port, healthPath, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: healthPath, timeout: timeoutMs }, (res) => {
      const ok = typeof res.statusCode === "number" && res.statusCode < 500;
      res.resume();
      resolve(ok);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function tcpProbe(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port, timeout: timeoutMs });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

// Deliberately HTTP-only, no bare-TCP fallback: a socket that merely accepts
// connections but never answers (a hung/zombie process) must count as "not
// ready", not "ready" - that distinction is the entire point of this check.
// tcpProbe() is used elsewhere for the separate question "is this port
// occupied at all", which does want to include an unhealthy process.
async function isReady(service) {
  return httpProbe(service.port, service.healthPath);
}

function waitUntil(conditionFn, timeoutMs, intervalMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await conditionFn()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// --- finding + force-stopping whatever owns a tracked port ---
// No identity check: these are dev-only, well-known ports for this project's
// own stack, so anything bound to them gets stopped, no questions asked.

function findPidsOnPort(port) {
  return new Promise((resolve) => {
    if (isWindows()) {
      execFile("netstat", ["-ano"], (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const pids = new Set();
        for (const rawLine of stdout.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length < 5) continue;
          const [proto, localAddr, , state, pid] = parts;
          if (proto !== "TCP") continue;
          if (!/LISTENING/i.test(state)) continue;
          if (!localAddr.endsWith(`:${port}`)) continue;
          if (/^\d+$/.test(pid)) pids.add(pid);
        }
        resolve([...pids]);
      });
    } else {
      execFile("lsof", ["-ti", `:${port}`], (err, stdout) => {
        if (err || !stdout) return resolve([]);
        resolve(
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      });
    }
  });
}

function killPid(pid) {
  return new Promise((resolve) => {
    if (isWindows()) {
      // /T kills the whole process tree - without it, killing e.g. only npm's
      // cmd.exe wrapper leaves the actual node process running as an orphan
      // (exactly the zombie-process problem this skill exists to prevent).
      execFile("taskkill", ["/F", "/T", "/PID", pid], () => resolve());
    } else {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        // already gone - fine
      }
      resolve();
    }
  });
}

async function stopService(service) {
  const pids = await findPidsOnPort(service.port);
  if (pids.length === 0) {
    console.log(`[${service.name}] niets actief op poort ${service.port}`);
    return;
  }

  for (const pid of pids) {
    await killPid(pid);
    console.log(`[${service.name}] PID ${pid} op poort ${service.port} gestopt`);
  }

  // Even wachten tot de OS de poort echt vrijgeeft, anders lijkt een meteen
  // volgende start-poging alsof de poort nog steeds bezet is.
  await waitUntil(async () => !(await tcpProbe(service.port, 300)), 5000, 200);
}

async function stopAll() {
  const services = discoverServices();
  if (services.length === 0) {
    console.log("Geen services gevonden (geen package met een dev/start-script + herkenbare poort).");
    return;
  }
  // Volgorde maakt niet uit bij stoppen - parallel is prima.
  await Promise.all(services.map((service) => stopService(service)));
}

// --- starting ---
// Geen vaste startvolgorde: services starten parallel. Als de een de ander
// nodig heeft bij opstart (zoals backend <- mcp-server in dit project) en te
// vroeg crasht, lost een korte herstartpoging dat vanzelf op zodra de ander
// intussen klaar is - zonder dat dit script iets over onderlinge
// afhankelijkheden hoeft te weten.

const MAX_START_ATTEMPTS = 3;

async function startService(service, attempt = 1) {
  if (await isReady(service)) {
    console.log(`[${service.name}] draait al en reageert op poort ${service.port}`);
    return;
  }

  // Poort is bezet maar reageert niet gezond (zombie/vastgelopen proces) - eerst opruimen.
  if (await tcpProbe(service.port, 300)) {
    console.log(`[${service.name}] poort ${service.port} bezet maar ongezond, wordt herstart`);
    await stopService(service);
  }

  const logFd = fs.openSync(logPath(service.name), attempt === 1 ? "w" : "a");
  const plan = buildSpawnPlan(service);
  const child = plan.useNpmRun
    ? spawnNpm(plan.args, {
        cwd: repoRoot,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
      })
    : spawn(plan.command, plan.args, {
        cwd: service.dir,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
      });
  fs.closeSync(logFd);
  child.unref();

  let crashed = false;
  let readySignaled = false;
  child.once("exit", () => {
    if (!readySignaled) crashed = true;
  });

  const ready = await waitUntil(async () => crashed || isReady(service), service.timeoutMs, 500);
  readySignaled = true;

  if (ready) {
    console.log(`[${service.name}] klaar op poort ${service.port}`);
    return;
  }

  if (attempt < MAX_START_ATTEMPTS) {
    console.log(
      `[${service.name}] ${crashed ? "crashte meteen" : "niet op tijd klaar"} ` +
        `(poging ${attempt}/${MAX_START_ATTEMPTS}), nieuwe poging...`
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return startService(service, attempt + 1);
  }

  throw new Error(
    `[${service.name}] na ${MAX_START_ATTEMPTS} pogingen niet gestart. Log: ${logPath(service.name)}`
  );
}

async function startAll() {
  const services = discoverServices();
  if (services.length === 0) {
    console.log("Geen services gevonden (geen package met een dev/start-script + herkenbare poort).");
    return;
  }

  const results = await Promise.allSettled(services.map((service) => startService(service)));
  const failures = results
    .map((result, index) => ({ result, service: services[index] }))
    .filter(({ result }) => result.status === "rejected");

  if (failures.length > 0) {
    for (const { result, service } of failures) {
      console.error(`[${service.name}] ${result.reason?.message ?? result.reason}`);
    }
    throw new Error(`${failures.length} service(s) niet gestart.`);
  }
}

async function status() {
  const services = discoverServices();
  if (services.length === 0) {
    console.log("Geen services gevonden (geen package met een dev/start-script + herkenbare poort).");
    return;
  }
  for (const service of services) {
    const ready = await isReady(service);
    const occupied = ready || (await tcpProbe(service.port, 300));
    const state = ready ? "klaar" : occupied ? "bezet maar ongezond" : "niet actief";
    console.log(`[${service.name}] poort ${service.port}: ${state}`);
  }
}

async function runTests() {
  await startAll();
  console.log("--- npm test ---");
  await new Promise((resolve, reject) => {
    const child = spawnNpm(["test"], { cwd: repoRoot, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm test faalde (exit code ${code})`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "stop":
      await stopAll();
      break;
    case "start":
      await startAll();
      break;
    case "restart":
      await stopAll();
      await startAll();
      break;
    case "test":
      await runTests();
      break;
    case "status":
      await status();
      break;
    default:
      console.log("Gebruik: node manage.mjs <stop|start|restart|test|status>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
