import { randomBytes } from "node:crypto";
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
  {
    // Fighters sign themselves up (phase 7): a participant is ACTIVE, PENDING (waiting for approval) or LEFT.
    // Existing participants become ACTIVE. One invite code per competition, readable so admins can show the link again.
    name: "2026-10-23-participant-status-and-signups",
    apply(database) {
      addColumn(
        database,
        "CompetitionParticipant",
        "status",
        "TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'LEFT'))",
      );
      addColumn(database, "CompetitionParticipant", "joinedAt", "TEXT");
      addColumn(database, "Competition", "signupsNeedApproval", "INTEGER NOT NULL DEFAULT 0");
      addColumn(database, "Competition", "placeLimit", "INTEGER");
      addColumn(database, "Competition", "inviteCode", "TEXT");
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_inviteCode
          ON Competition(inviteCode) WHERE inviteCode IS NOT NULL;
      `);
    },
  },
  {
    // Tournament mode, sheet flavour: rings, bouts and exchanges stored live, plus an outbox that mirrors them to sheets.
    name: "2026-10-25-live-tournaments",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS LiveTournament (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('SHEET')),
          layoutVersion TEXT NOT NULL,
          googleSpreadsheetId TEXT,
          createdByUserId TEXT NOT NULL REFERENCES User(id),
          createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS LiveRing (
          id TEXT PRIMARY KEY,
          tournamentId TEXT NOT NULL REFERENCES LiveTournament(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          "order" INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_liveRing_name ON LiveRing(tournamentId, name);
        CREATE TABLE IF NOT EXISTS LiveBout (
          id TEXT PRIMARY KEY,
          tournamentId TEXT NOT NULL REFERENCES LiveTournament(id) ON DELETE CASCADE,
          ringId TEXT NOT NULL REFERENCES LiveRing(id) ON DELETE CASCADE,
          "order" INTEGER NOT NULL,
          label TEXT NOT NULL,
          sheetName TEXT NOT NULL,
          headerCell TEXT NOT NULL,
          fighterLeft TEXT NOT NULL,
          fighterRight TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE')),
          startedAt TEXT,
          finishedAt TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_liveBout_cell ON LiveBout(tournamentId, sheetName, headerCell);
        CREATE INDEX IF NOT EXISTS idx_liveBout_ring ON LiveBout(ringId, "order");
        CREATE TABLE IF NOT EXISTS LiveExchange (
          id TEXT PRIMARY KEY,
          boutId TEXT NOT NULL REFERENCES LiveBout(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('EXCHANGE', 'DEDUCTION')),
          leftPoints INTEGER NOT NULL,
          rightPoints INTEGER NOT NULL,
          isDouble INTEGER NOT NULL DEFAULT 0,
          firstScorer TEXT CHECK (firstScorer IN ('LEFT', 'RIGHT')),
          clientExchangeId TEXT NOT NULL,
          createdByUserId TEXT NOT NULL REFERENCES User(id),
          createdAt TEXT NOT NULL,
          undoneAt TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_liveExchange_client ON LiveExchange(boutId, clientExchangeId);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_liveExchange_seq ON LiveExchange(boutId, seq);
        CREATE TABLE IF NOT EXISTS LiveSyncJob (
          id TEXT PRIMARY KEY,
          tournamentId TEXT NOT NULL REFERENCES LiveTournament(id) ON DELETE CASCADE,
          boutId TEXT NOT NULL REFERENCES LiveBout(id) ON DELETE CASCADE,
          target TEXT NOT NULL CHECK (target IN ('LOCAL', 'GOOGLE')),
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'DONE', 'FAILED')),
          attempts INTEGER NOT NULL DEFAULT 0,
          nextAttemptAt TEXT NOT NULL,
          lastError TEXT,
          updatedAt TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_liveSyncJob_bout_target ON LiveSyncJob(boutId, target);
        CREATE INDEX IF NOT EXISTS idx_liveSyncJob_due ON LiveSyncJob(status, nextAttemptAt);
        CREATE TABLE IF NOT EXISTS LiveSyncState (
          tournamentId TEXT NOT NULL REFERENCES LiveTournament(id) ON DELETE CASCADE,
          target TEXT NOT NULL CHECK (target IN ('LOCAL', 'GOOGLE')),
          lastSuccessAt TEXT,
          lastError TEXT,
          lastErrorAt TEXT,
          PRIMARY KEY (tournamentId, target)
        );
      `);
    },
  },
  {
    // Skill is read by user lookups but was only created by the old officials SQL migration, so a fresh
    // database lacked it. Mirrors sql/migrations/20260809154100_officials.
    name: "2026-10-26-skill-table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS "Skill" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "skillName" TEXT NOT NULL,
            "skillLevel" INTEGER NOT NULL,
            CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "Skill_userId_idx" ON "Skill"("userId");
      `);
    },
  },
  {
    // Ring mode: each ring link carries a secret keeper token, one device keeps the ring, and the bout clock is stored.
    name: "2026-10-26-live-ring-keeper",
    apply(database) {
      addColumn(database, "LiveRing", "keeperToken", "TEXT");
      addColumn(database, "LiveRing", "activeDeviceId", "TEXT");
      addColumn(database, "LiveRing", "activeUserId", "TEXT REFERENCES User(id)");
      addColumn(database, "LiveRing", "activeSince", "TEXT");
      const missing = database.prepare("SELECT id FROM LiveRing WHERE keeperToken IS NULL").all() as Array<{ id: string }>;
      const setToken = database.prepare("UPDATE LiveRing SET keeperToken = ? WHERE id = ?");
      for (const ring of missing) setToken.run(randomBytes(24).toString("base64url"), ring.id);
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_liveRing_keeperToken ON LiveRing(keeperToken)");
      addColumn(database, "LiveBout", "clockSeconds", "INTEGER NOT NULL DEFAULT 0");
      addColumn(database, "LiveBout", "clockRunning", "INTEGER NOT NULL DEFAULT 0");
      addColumn(database, "LiveBout", "clockUpdatedAt", "TEXT");
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
