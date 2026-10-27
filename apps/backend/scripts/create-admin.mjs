// Creates a SYSTEM_ADMIN in the configured database (DATABASE_URL). Needs a built backend (npm run build).
// Use `create-admin:env` when the server runs with `start:env` (loads .env); both must see the same DATABASE_URL.
// Usage: npm run create-admin --workspace @hema/backend -- --username <u> --name <n>
// The password is read from stdin (hidden when typing in a terminal) and is never accepted as an argument.
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { username: { type: "string" }, name: { type: "string" } },
  strict: true,
});
if (!values.username || !values.name) {
  console.error("Usage: create-admin --username <username> --name <display name>   (password is asked on stdin)");
  process.exit(2);
}

function readPassword() {
  const input = process.stdin;
  if (!input.isTTY) {
    return new Promise((resolve, reject) => {
      let data = "";
      input.setEncoding("utf8");
      input.on("data", (chunk) => (data += chunk));
      input.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      input.on("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    process.stderr.write("Password: ");
    let password = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stderr.write("\n");
      error ? reject(error) : resolve(password);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          return finish();
        }
        if (char === "\u0003") {
          return finish(new Error("Cancelled."));
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
        } else {
          password += char;
        }
      }
    };
    input.on("data", onData);
  });
}

const password = await readPassword();
if (!password) {
  console.error("Password must not be empty.");
  process.exit(1);
}

const { db, resolveDatabasePath } = await import("../dist/db.js");
console.error(`Database: ${resolveDatabasePath()}`);
const { createAdmin } = await import("../dist/create-admin.js");
try {
  await createAdmin(db, { username: values.username, name: values.name, password });
  console.log(`Created SYSTEM_ADMIN "${values.username}".`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
