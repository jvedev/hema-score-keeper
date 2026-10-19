import type BetterSqlite3 from "better-sqlite3";

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

interface SchemaMigration {
  name: string;
  apply(database: NativeDatabase): void;
}

const LIFECYCLE_STATUSES = ["DRAFT", "REGISTRATION_OPEN", "RUNNING", "CLOSED", "ARCHIVED"];

const MIGRATIONS: readonly SchemaMigration[] = [
  {
    name: "2026-10-19-competition-admin-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS CompetitionAdmin (
          competitionId TEXT NOT NULL,
          userId TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('OWNER', 'CO_ADMIN')),
          PRIMARY KEY (competitionId, userId),
          FOREIGN KEY (competitionId) REFERENCES Competition(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_competition_admin_userId ON CompetitionAdmin(userId);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_admin_one_owner
          ON CompetitionAdmin(competitionId) WHERE role = 'OWNER';
      `);
    },
  },
  {
    name: "2026-10-19-competition-scope-columns",
    apply(database) {
      addColumn(database, "Competition", "scopeKind", "TEXT NOT NULL DEFAULT 'OPEN'");
      addColumn(database, "Competition", "scopeValuesJson", "TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    name: "2026-10-19-club-area-country",
    apply(database) {
      addColumn(database, "Club", "area", "TEXT");
      addColumn(database, "Club", "countryCode", "TEXT");
    },
  },
  {
    name: "2026-10-19-user-language",
    apply(database) {
      addColumn(database, "User", "language", "TEXT NOT NULL DEFAULT 'en'");
    },
  },
  {
    name: "2026-10-19-map-competition-statuses",
    apply(database) {
      database.prepare("UPDATE Competition SET status = 'RUNNING' WHERE status = 'ACTIVE'").run();
      const placeholders = LIFECYCLE_STATUSES.map(() => "?").join(", ");
      database.prepare(`UPDATE Competition SET status = 'DRAFT' WHERE status NOT IN (${placeholders})`).run(...LIFECYCLE_STATUSES);
    },
  },
  {
    // Club admins used to manage every competition of their club (and every club-less one).
    // Keep that access by making them co-admins, so nobody loses access on upgrade.
    name: "2026-10-19-club-admins-become-co-admins",
    apply(database) {
      database.exec(`
        INSERT OR IGNORE INTO CompetitionAdmin (competitionId, userId, role)
        SELECT Competition.id, User.id, 'CO_ADMIN'
        FROM Competition
        JOIN User ON User.role = 'COMPETITION_ADMIN'
          AND (Competition.clubId IS NULL OR User.clubId = Competition.clubId);
      `);
    },
  },
];

export function applySchemaMigrations(database: NativeDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS SchemaMigration (
      name TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (database.prepare("SELECT name FROM SchemaMigration").all() as Array<{ name: string }>).map((row) => row.name),
  );
  const record = database.prepare("INSERT INTO SchemaMigration (name, appliedAt) VALUES (?, ?)");

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      continue;
    }
    database.transaction(() => {
      migration.apply(database);
      record.run(migration.name, new Date().toISOString());
    })();
  }
}

function addColumn(database: NativeDatabase, table: string, column: string, definition: string): void {
  const existing = database.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  if (!existing.some((row) => row.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
