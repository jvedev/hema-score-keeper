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
  {
    name: "2026-10-20-bout-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS Bout (
          id TEXT PRIMARY KEY,
          fighterAUserId TEXT NOT NULL REFERENCES User(id),
          fighterBUserId TEXT NOT NULL REFERENCES User(id),
          refereeUserId TEXT NOT NULL REFERENCES User(id),
          tableUserId TEXT REFERENCES User(id),
          ring TEXT,
          startedAt TEXT NOT NULL,
          scoreA INTEGER NOT NULL,
          scoreB INTEGER NOT NULL,
          winnerSide TEXT CHECK (winnerSide IN ('A', 'B')),
          warningsA INTEGER NOT NULL DEFAULT 0,
          warningsB INTEGER NOT NULL DEFAULT 0,
          exchangesJson TEXT NOT NULL DEFAULT '[]',
          startedInCompetitionId TEXT REFERENCES Competition(id) ON DELETE SET NULL,
          createdByUserId TEXT NOT NULL REFERENCES User(id),
          status TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          windowStartedAt TEXT,
          fighterApprovedA INTEGER NOT NULL DEFAULT 0,
          fighterApprovedB INTEGER NOT NULL DEFAULT 0,
          objectionBy TEXT CHECK (objectionBy IN ('A', 'B')),
          objectionAt TEXT,
          objectionReason TEXT,
          voidReason TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_bout_fighterA ON Bout(fighterAUserId);
        CREATE INDEX IF NOT EXISTS idx_bout_fighterB ON Bout(fighterBUserId);
        CREATE INDEX IF NOT EXISTS idx_bout_referee ON Bout(refereeUserId);
      `);
    },
  },
  {
    name: "2026-10-20-bout-jury-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS BoutJury (
          boutId TEXT NOT NULL REFERENCES Bout(id) ON DELETE CASCADE,
          seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 4),
          userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
          PRIMARY KEY (boutId, seat),
          UNIQUE (boutId, userId)
        );
      `);
    },
  },
  {
    name: "2026-10-20-bout-competition-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS BoutCompetition (
          boutId TEXT NOT NULL REFERENCES Bout(id) ON DELETE CASCADE,
          competitionId TEXT NOT NULL REFERENCES Competition(id) ON DELETE CASCADE,
          PRIMARY KEY (boutId, competitionId)
        );
        CREATE INDEX IF NOT EXISTS idx_bout_competition_competitionId ON BoutCompetition(competitionId);
      `);
    },
  },
  {
    name: "2026-10-20-bout-revision-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS BoutRevision (
          boutId TEXT NOT NULL REFERENCES Bout(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          scoreA INTEGER NOT NULL,
          scoreB INTEGER NOT NULL,
          winnerSide TEXT,
          warningsA INTEGER NOT NULL,
          warningsB INTEGER NOT NULL,
          exchangesJson TEXT NOT NULL,
          replacedAt TEXT NOT NULL,
          replacedByUserId TEXT NOT NULL REFERENCES User(id),
          PRIMARY KEY (boutId, revision)
        );
      `);
    },
  },
  {
    // A bout has zero, one or two table officials; Bout.tableUserId is no longer used.
    name: "2026-10-20-bout-table-officials",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS BoutTableOfficial (
          boutId TEXT NOT NULL REFERENCES Bout(id) ON DELETE CASCADE,
          seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 2),
          userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
          PRIMARY KEY (boutId, seat),
          UNIQUE (boutId, userId)
        );
        INSERT OR IGNORE INTO BoutTableOfficial (boutId, seat, userId)
        SELECT id, 1, tableUserId FROM Bout WHERE tableUserId IS NOT NULL;
      `);
    },
  },
  {
    // Whether bouts fought for another competition may also count here (the operator still chooses per bout).
    name: "2026-10-20-competition-accepts-other-bouts",
    apply(database) {
      addColumn(database, "Competition", "acceptsOtherBouts", "INTEGER NOT NULL DEFAULT 1");
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
