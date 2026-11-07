import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootManifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const backendManifest = JSON.parse(
  await readFile(path.join(repoRoot, "apps", "backend", "package.json"), "utf8"),
);
const npmCli = process.env.npm_execpath;
const verifyOnly = process.argv[2] === "--verify-only";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The Windows package must be built on a Windows x64 machine.");
}
if (verifyOnly) {
  const packageDirectory = path.resolve(process.argv[3] ?? "");
  if (!process.argv[3]) {
    throw new Error("Usage: node scripts/package-windows.mjs --verify-only <package-directory>");
  }
  await verifyLauncher(packageDirectory);
  process.exit(0);
}
if (!npmCli) {
  throw new Error("Run this script through npm: npm run package:windows");
}

await run(process.execPath, [npmCli, "run", "build:deployment"], repoRoot);

const artifactsRoot = path.join(repoRoot, "artifacts", "windows");
const packageName = `HemaScoreKeeper-${rootManifest.version}-win-x64-${Date.now()}`;
const packageRoot = path.join(artifactsRoot, packageName);
await mkdir(artifactsRoot, { recursive: true });
const stagingRoot = await mkdtemp(path.join(artifactsRoot, `.${packageName}-`));
const serverRoot = path.join(stagingRoot, "server");
const backendRoot = path.join(serverRoot, "apps", "backend");

try {
  await mkdir(backendRoot, { recursive: true });
  if (await exists(packageRoot)) {
    throw new Error(`The package already exists and will not be overwritten: ${packageRoot}`);
  }

  for (const app of ["competition", "competition-admin", "score-keeper", "event-admin", "tournament-admin"]) {
    await cp(path.join(repoRoot, "apps", app, "dist"), path.join(serverRoot, "apps", app, "dist"), {
      recursive: true,
    });
  }
  await cp(path.join(repoRoot, "apps", "backend", "dist"), path.join(backendRoot, "dist"), {
    recursive: true,
  });
  await mkdir(path.join(backendRoot, "scripts"), { recursive: true });
  await cp(
    path.join(repoRoot, "apps", "backend", "scripts", "create-admin.mjs"),
    path.join(backendRoot, "scripts", "create-admin.mjs"),
  );
  await cp(
    path.join(repoRoot, "deployment", "windows-launcher", "CreateAdmin.cmd"),
    path.join(stagingRoot, "CreateAdmin.cmd"),
  );
  await mkdir(path.join(serverRoot, "deployment"), { recursive: true });
  await cp(path.join(repoRoot, "deployment", "apps.json"), path.join(serverRoot, "deployment", "apps.json"));

  for (const workspace of ["competition-domain", "ranking"]) {
    const workspaceRoot = path.join(serverRoot, "packages", workspace);
    await mkdir(workspaceRoot, { recursive: true });
    await cp(path.join(repoRoot, "packages", workspace, "dist"), path.join(workspaceRoot, "dist"), {
      recursive: true,
    });
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, "packages", workspace, "package.json"), "utf8"),
    );
    delete manifest.devDependencies;
    if (workspace === "competition-domain") {
      manifest.dependencies = { "@hema/ranking": "file:../ranking" };
    } else {
      delete manifest.dependencies;
    }
    await writeFile(path.join(workspaceRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const dependencies = { ...backendManifest.dependencies };
  dependencies["@hema/competition-domain"] = "file:./packages/competition-domain";
  dependencies["@hema/ranking"] = "file:./packages/ranking";
  await writeFile(
    path.join(serverRoot, "package.json"),
    `${JSON.stringify({ private: true, type: "module", dependencies }, null, 2)}\n`,
  );
  await mkdir(path.join(stagingRoot, "runtime"), { recursive: true });
  await cp(process.execPath, path.join(stagingRoot, "runtime", "node.exe"));
  await writeFile(
    path.join(stagingRoot, "README.txt"),
    [
      "HEMA Score Keeper local server",
      "",
      "Start HemaScoreKeeper.Launcher.exe. The server and all five apps are served from one origin.",
      "Connect phones to the same Wi-Fi and open one of the LAN addresses printed by the launcher.",
      "Allow its TCP port on the Windows Private network profile if Windows Firewall asks.",
      "Do not configure public router port forwarding. This local HTTP setup does not support Web Push.",
      "",
      "Persistent data and configuration are stored in %LOCALAPPDATA%\\HemaScoreKeeper, outside this package.",
      "The launcher creates an AUTH_SECRET automatically. Back up this folder to preserve the database and live files.",
      "The server log is server.log in that data folder. Set HEMASCORE_PORT before starting to use another port.",
      "Set HEMASCORE_DATA_DIR before launch only if you want to use a different persistent data folder.",
      "",
      "Create the first administrator from Command Prompt after starting the server once:",
      '  CreateAdmin.cmd --username admin --name "Administrator"',
      "",
      "Do not delete or replace the data folder when updating the application package.",
      "",
    ].join("\r\n"),
  );

  await run(
    process.execPath,
    [npmCli, "install", "--omit=dev", "--no-audit", "--no-fund"],
    serverRoot,
  );
  await run(process.execPath, [npmCli, "install-scripts", "approve", "better-sqlite3"], serverRoot);
  await verifyPackageNode(path.join(stagingRoot, "runtime", "node.exe"), serverRoot);

  const dotnetArtifacts = path.join(stagingRoot, "dotnet-artifacts");
  await run(
    "dotnet",
    [
      "publish",
      path.join(repoRoot, "deployment", "windows-launcher", "HemaScoreKeeper.Launcher.csproj"),
      "--configuration",
      "Release",
      "--artifacts-path",
      dotnetArtifacts,
      "--output",
      stagingRoot,
    ],
    repoRoot,
  );
  await verifyLauncher(stagingRoot);

  await moveDirectory(stagingRoot, packageRoot);
  console.log(`Windows package created: ${packageRoot}`);
} finally {
  if (await exists(stagingRoot)) {
    await rm(stagingRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

async function verifyPackageNode(nodePath, serverDirectory) {
  const tempData = await mkdtemp(path.join(os.tmpdir(), "hema-score-keeper-smoke-"));
  const port = await availablePort();
  const child = spawn(nodePath, ["apps/backend/dist/server.js"], {
    cwd: serverDirectory,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      APP_DATA_DIR: tempData,
      DATABASE_URL: "file:./dev.db",
      LIVE_DATA_DIR: path.join(tempData, "live"),
      AUTH_SECRET: "deployment-smoke-test-secret-not-for-production",
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      HEMASCORE_SHUTDOWN_ON_STDIN: "1",
    },
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));

  try {
    await waitForHealth(child, `http://127.0.0.1:${port}/health`, () => output);
    const root = await fetch(`http://127.0.0.1:${port}/`);
    const rootHtml = await root.text();
    const deployment = JSON.parse(await readFile(path.join(repoRoot, "deployment", "apps.json"), "utf8"));
    if (!root.ok || deployment.apps.some((app) => !rootHtml.includes(`href="${app.base}"`))) {
      throw new Error("The packaged server root page did not contain all app links.");
    }

    for (const app of deployment.apps) {
      const base = `http://127.0.0.1:${port}${app.base}`;
      const response = await fetch(base);
      if (!response.ok || !(await response.text()).includes("<html")) {
        throw new Error(`Packaged app did not load at ${app.base}.`);
      }
      const deepLink = await fetch(`${base}deployment-smoke`, { headers: { Accept: "text/html" } });
      const deepLinkHtml = await deepLink.text();
      if (!deepLink.ok || !deepLinkHtml.includes("<html")) {
        throw new Error(`Packaged deep link failed at ${app.base} (${deepLink.status}): ${deepLinkHtml.slice(0, 160)}`);
      }
    }
    console.log("Verified packaged Windows runtime, SQLite startup, all app roots, and deep links.");
  } catch (error) {
    throw new Error(`Packaged server smoke check failed.\n${output}`, { cause: error });
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.stdin.end();
        await waitForExit(child);
      }
    } finally {
      await rm(tempData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  }
}

async function verifyLauncher(packageDirectory) {
  const tempData = await mkdtemp(path.join(os.tmpdir(), "hema-score-keeper-launcher-"));
  const port = await availablePort();
  const launcherPath = path.join(packageDirectory, "HemaScoreKeeper.Launcher.exe");
  const nodePath = path.join(packageDirectory, "runtime", "node.exe");
  let child;
  let output = "";

  try {
    child = startLauncher();
    await waitForHealth(child, `http://127.0.0.1:${port}/health`, () => output);
    const root = await fetch(`http://127.0.0.1:${port}/`);
    if (!root.ok || !(await root.text()).includes('href="/score-keeper/"')) {
      throw new Error("The packaged launcher did not serve its app index.");
    }
    if (!(await exists(path.join(tempData, "server.env"))) || !(await exists(path.join(tempData, "server.log")))) {
      throw new Error("The packaged launcher did not create its data configuration and log.");
    }
    const secretBeforeRestart = await readAuthSecret(path.join(tempData, "server.env"));

    await stopLauncher(child);
    child = undefined;

    await runNode([
      "-e",
      [
        'const Database = require("./server/node_modules/better-sqlite3");',
        `const db = new Database(${JSON.stringify(path.join(tempData, "dev.db"))});`,
        'db.exec("CREATE TABLE IF NOT EXISTS DeploymentSmoke (key TEXT PRIMARY KEY, value TEXT NOT NULL)");',
        'db.prepare("INSERT OR REPLACE INTO DeploymentSmoke (key, value) VALUES (?, ?)").run("persisted", "survives-restart");',
        "db.close();",
      ].join(" "),
    ]);

    child = startLauncher();
    await waitForHealth(child, `http://127.0.0.1:${port}/health`, () => output);
    const secretAfterRestart = await readAuthSecret(path.join(tempData, "server.env"));
    if (secretAfterRestart !== secretBeforeRestart) {
      throw new Error("The launcher's AUTH_SECRET changed across a restart.");
    }
    await runNode([
      "-e",
      [
        'const Database = require("./server/node_modules/better-sqlite3");',
        `const db = new Database(${JSON.stringify(path.join(tempData, "dev.db"))});`,
        'const row = db.prepare("SELECT value FROM DeploymentSmoke WHERE key = ?").get("persisted");',
        "db.close();",
        'if (row?.value !== "survives-restart") process.exit(1);',
        'console.log("Verified SQLite application data survives a launcher restart.");',
      ].join(" "),
    ]);

    await stopLauncher(child);
    child = undefined;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      } catch (error) {
        if (error instanceof TypeError || error.name === "TimeoutError") {
          console.log("Verified packaged Windows launcher starts, preserves local data and secret across restart, and shuts down cleanly.");
          return;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("The backend remained reachable after the launcher exited.");
  } catch (error) {
    throw new Error(`Packaged launcher smoke check failed.\n${output}`, { cause: error });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      await stopLauncher(child);
    }
    await rm(tempData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }

  function startLauncher() {
    const process = spawn(launcherPath, [], {
      cwd: packageDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...globalThis.process.env,
        HEMASCORE_DATA_DIR: tempData,
        HEMASCORE_PORT: String(port),
        HEMASCORE_NO_BROWSER: "1",
      },
    });
    process.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
    process.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));
    return process;
  }

  function runNode(args) {
    return run(nodePath, args, packageDirectory);
  }
}

async function readAuthSecret(envPath) {
  const contents = await readFile(envPath, "utf8");
  const secret = contents.match(/^AUTH_SECRET=(.+)$/m)?.[1];
  if (!secret) throw new Error("The launcher did not persist its AUTH_SECRET.");
  return secret;
}

async function stopLauncher(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.write("stop\n");
  await waitForExit(child);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let timer;
  try {
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Packaged server did not stop after stdin closed.")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(child, url, getOutput) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged server exited before becoming ready.\n${getOutput()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Packaged server did not become ready in 30 seconds.\n${getOutput()}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not allocate a local port for the package smoke check.");
  }
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

async function moveDirectory(source, destination) {
  try {
    await rename(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV" && !(process.platform === "win32" && error.code === "EPERM")) throw error;
    await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    await rm(source, { recursive: true, force: true });
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}
