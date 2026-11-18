import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, initializeDatabase } from "../src/db.js";
import { BACKEND_TABLES, DatabaseSchemaError, SCHEMA_VERSION } from "../src/schema.js";

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

interface ForeignKeyRow {
  id: number;
  table: string;
  from: string;
  to: string | null;
}

let native: NativeDatabase;

function freshDatabase(): NativeDatabase {
  const database = new BetterSqlite3(":memory:");
  initializeDatabase(database);
  return database;
}

function tableNames(database: NativeDatabase): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function schemaObjects(database: NativeDatabase): Array<{ type: string; name: string; sql: string | null }> {
  return database.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all() as Array<{
    type: string;
    name: string;
    sql: string | null;
  }>;
}

function foreignKeys(database: NativeDatabase, table: string): ForeignKeyRow[] {
  return database.prepare(`PRAGMA foreign_key_list("${table}")`).all() as ForeignKeyRow[];
}

/** Columns SQLite accepts as a foreign key parent: the primary key or the columns of a unique index. */
function uniqueKeys(database: NativeDatabase, table: string): string[][] {
  const columns = database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; pk: number }>;
  const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
  const indexes = database.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string; unique: number; partial: number }>;
  const uniqueIndexes = indexes
    .filter((index) => index.unique === 1 && index.partial === 0)
    .map((index) =>
      (database.prepare(`PRAGMA index_info("${index.name}")`).all() as Array<{ name: string }>).map((column) => column.name),
    );
  return [primaryKey, ...uniqueIndexes];
}

beforeEach(() => {
  native = freshDatabase();
});

afterEach(() => {
  native.close();
});

describe("baseline schema on a fresh database", () => {
  it("creates exactly the tables of BackendDatabase", () => {
    expect(tableNames(native)).toEqual([...BACKEND_TABLES].sort());
  });

  it("stamps the schema version", () => {
    expect(native.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("enables foreign keys", () => {
    expect(native.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("passes the integrity and foreign key checks", () => {
    expect(native.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(native.pragma("foreign_key_check")).toEqual([]);
  });

  it("points every foreign key at an existing table and a primary or unique key", () => {
    const tables = new Set(tableNames(native));
    for (const table of tables) {
      const byConstraint = new Map<string, ForeignKeyRow[]>();
      for (const key of foreignKeys(native, table)) {
        expect(tables, `${table}.${key.from} -> ${key.table}`).toContain(key.table);
        const id = `${key.table}#${key.id}`;
        byConstraint.set(id, [...(byConstraint.get(id) ?? []), key]);
      }
      for (const keys of byConstraint.values()) {
        const parent = keys[0]!.table;
        const parentColumns = keys.map((key) => key.to ?? "id");
        const candidates = uniqueKeys(native, parent).map((columns) => [...columns].sort().join(","));
        expect(candidates, `${table}(${keys.map((key) => key.from).join(",")}) -> ${parent}`).toContain(
          [...parentColumns].sort().join(","),
        );
      }
    }
  });

  it("orders BACKEND_TABLES so every table follows the tables it references", () => {
    const position = new Map(BACKEND_TABLES.map((table, index) => [table, index] as const));
    // Circular references between Event-admin tables are nullable back-pointers; they are created after both tables.
    const backPointers = new Set(["Event.rulesetId", "Tournament.currentStageId", "EventSchedule.currentTimeSlotId"]);
    for (const table of BACKEND_TABLES) {
      for (const key of foreignKeys(native, table)) {
        if (key.table === table || backPointers.has(`${table}.${key.from}`)) continue;
        expect(position.get(key.table as (typeof BACKEND_TABLES)[number]), `${table}.${key.from} -> ${key.table}`).toBeLessThan(
          position.get(table)!,
        );
      }
    }
  });
});

describe("initializing an existing database", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "hema-schema-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("leaves a database with the current version untouched", async () => {
    const file = path.join(directory, "venue.db");
    const first = createDatabase(`file:${file}`);
    await first.insertInto("Club").values({ id: "c1", name: "Club", slug: "club", area: null, countryCode: null }).execute();
    await first.destroy();

    const before = new BetterSqlite3(file);
    const objectsBefore = schemaObjects(before);
    before.close();

    const second = createDatabase(`file:${file}`);
    const clubs = await second.selectFrom("Club").select("id").execute();
    await second.destroy();

    const after = new BetterSqlite3(file);
    expect(schemaObjects(after)).toEqual(objectsBefore);
    expect(after.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    after.close();
    expect(clubs).toEqual([{ id: "c1" }]);
  });

  it("accepts extra tables in a database with the current version", () => {
    native.exec("CREATE TABLE DeploymentSmoke (key TEXT PRIMARY KEY)");
    expect(() => initializeDatabase(native)).not.toThrow();
  });

  it("refuses a database that has tables but no schema version", () => {
    const legacy = new BetterSqlite3(":memory:");
    legacy.exec("CREATE TABLE User (id TEXT PRIMARY KEY)");
    expect(() => initializeDatabase(legacy)).toThrow(DatabaseSchemaError);
    expect(() => initializeDatabase(legacy)).toThrow(/recreate the database.*db:reset/s);
    expect(tableNames(legacy)).toEqual(["User"]);
    legacy.close();
  });

  it("refuses a database with another schema version", () => {
    const other = new BetterSqlite3(":memory:");
    other.exec("CREATE TABLE Club (id TEXT PRIMARY KEY)");
    other.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => initializeDatabase(other)).toThrow(DatabaseSchemaError);
    other.close();
  });

  it("refuses an empty database stamped with another version", () => {
    const empty = new BetterSqlite3(":memory:");
    empty.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => initializeDatabase(empty)).toThrow(DatabaseSchemaError);
    expect(tableNames(empty)).toEqual([]);
    empty.close();
  });
});
