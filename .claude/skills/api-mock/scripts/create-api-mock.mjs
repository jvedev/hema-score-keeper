#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

function printHelp() {
  console.log(`
create-api-mock.mjs - generate a strict fetch mock

Options:
  --name <mock-name>          Required. Kebab-case mock name
  --url <url>                 Required. Exact URL or pathname to match
  --method <method>           HTTP method (default: GET)
  --status <status>           Response status (default: 200)
  --body <body>               JSON value or plain text (default: {})
  --content-type <type>       Response content type (default: application/json)
  --delay <milliseconds>      Response delay (default: 0)
  --output <path>             Output file (default: test/mocks/<name>.mock.mjs)
  --force                     Overwrite an existing file
  --dry-run                   Print output without writing
  --help                      Show this help
`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--name") args.name = argv[++index];
    else if (arg === "--url") args.url = argv[++index];
    else if (arg === "--method") args.method = argv[++index];
    else if (arg === "--status") args.status = argv[++index];
    else if (arg === "--body") args.body = argv[++index];
    else if (arg === "--content-type") args.contentType = argv[++index];
    else if (arg === "--delay") args.delay = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument "${arg}".`);
  }

  return args;
}

function toPascalCase(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function parseInteger(value, fallback, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function parseBody(value, contentType) {
  if (!contentType.toLowerCase().includes("json")) return value;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error('--body must contain valid JSON when --content-type includes "json".');
  }
}

function template({ name, url, method, status, body, contentType, delay }) {
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);
  const bodyValue = JSON.stringify(body, null, 2);
  const serializedBody = contentType.toLowerCase().includes("json")
    ? `JSON.stringify(${camelName}Response)`
    : `${camelName}Response`;

  return `export const ${camelName}Response = ${bodyValue};

export function install${pascalName}Mock() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url);
    const matchesUrl = request.url === ${JSON.stringify(url)} || requestUrl.pathname + requestUrl.search === ${JSON.stringify(url)};

    if (request.method !== ${JSON.stringify(method)} || !matchesUrl) {
      throw new Error(\`Unexpected request: \${request.method} \${request.url}\`);
    }

    calls.push(request);
${delay > 0 ? `    await new Promise((resolve) => setTimeout(resolve, ${delay}));\n` : ""}
    return new Response(${serializedBody}, {
      status: ${status},
      headers: { "content-type": ${JSON.stringify(contentType)} },
    });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.name) throw new Error('Missing required argument "--name".');
  if (!args.url) throw new Error('Missing required argument "--url".');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.name)) {
    throw new Error(`Invalid name "${args.name}". Use kebab-case.`);
  }

  const method = (args.method ?? "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error(`Invalid HTTP method "${method}".`);

  const status = parseInteger(args.status, 200, "Status", 100, 599);
  const delay = parseInteger(args.delay, 0, "Delay", 0);
  const contentType = args.contentType ?? "application/json";
  const body = parseBody(args.body ?? "{}", contentType);
  const outputPath = path.resolve(repoRoot, args.output ?? path.join("test", "mocks", `${args.name}.mock.mjs`));
  const relativeOutput = path.relative(repoRoot, outputPath);

  if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("--output must stay inside the repository.");
  }
  if (fs.existsSync(outputPath) && !args.force) {
    throw new Error(`File already exists: ${relativeOutput}. Re-run with --force to overwrite.`);
  }

  const content = template({
    name: args.name,
    url: args.url,
    method,
    status,
    body,
    contentType,
    delay,
  });

  if (args.dryRun) {
    console.log(`Would create ${relativeOutput}`);
    console.log("");
    console.log(content);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  console.log(`Created ${relativeOutput}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
