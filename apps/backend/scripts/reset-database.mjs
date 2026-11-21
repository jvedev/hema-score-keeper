// Recreates the development database from the baseline schema and fills it with sample data.
// The database is the one the server uses (DATABASE_URL / APP_DATA_DIR, default apps/backend/data/dev.db).
// An existing file is kept as <file>.bak-<timestamp> next to it. Stop the backend first.
// Needs a built backend; `npm run db:reset` (or `npm run backend:db:reset` from the root) builds first.
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { importBackend, seedDatabase } from "./seed-database.mjs";

const { openNativeDatabase, resolveDatabasePath } = await importBackend("native-database.js");
const { BACKEND_TABLES } = await importBackend("schema.js");

const databasePath = resolveDatabasePath();
if (databasePath === ":memory:") {
  console.error("Refusing to reset an in-memory database: point DATABASE_URL at a database file.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${databasePath}.bak-${timestamp}`;

// SQLite's journal files belong to the database file; move them along so the fresh database starts clean.
const files = [databasePath, `${databasePath}-journal`, `${databasePath}-wal`, `${databasePath}-shm`].filter((file) => existsSync(file));
try {
  for (const file of files) {
    await rename(file, file.replace(databasePath, backupPath));
  }
} catch (error) {
  console.error(`Could not move ${databasePath} aside. Is the backend still running? Stop it and try again.`);
  throw error;
}
if (files.length > 0) {
  console.log(`Backed up the old database to ${backupPath}`);
}

const { seedDemoCompetitionsIfEmpty } = await importBackend("competition-bootstrap.js");
const database = openNativeDatabase();
try {
  console.log(`Created ${databasePath} from the baseline schema.`);
  seedDatabase(database, BACKEND_TABLES);
  seedDemoCompetitionsIfEmpty(database);
} finally {
  database.close();
}
