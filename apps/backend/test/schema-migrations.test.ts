import BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeCompetitionDatabase } from "../src/competition-bootstrap.js";
import { applySchemaMigrations } from "../src/schema-migrations.js";

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

let database: NativeDatabase;

function columns(table: string): string[] {
  return (database.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map((column) => column.name);
}

function status(id: string): string {
  return (database.prepare("SELECT status FROM Competition WHERE id = ?").get(id) as { status: string }).status;
}

function adminRows(): Array<{ competitionId: string; userId: string; role: string }> {
  return database
    .prepare("SELECT competitionId, userId, role FROM CompetitionAdmin ORDER BY competitionId, userId")
    .all() as Array<{ competitionId: string; userId: string; role: string }>;
}

function insertUser(id: string, role: string, clubId: string | null): void {
  database
    .prepare("INSERT INTO User (id, clubId, name, username, role, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')")
    .run(id, clubId, id, id, role);
}

beforeEach(() => {
  database = new BetterSqlite3(":memory:");
  database.pragma("foreign_keys = ON");
  // Seeds competition-1 (RUNNING), competition-2 (ARCHIVED) and competition-3 (DRAFT).
  initializeCompetitionDatabase(database);
});

describe("applySchemaMigrations", () => {
  it("maps old statuses onto the new lifecycle", () => {
    database.prepare("UPDATE Competition SET status = 'ACTIVE' WHERE id = 'competition-1'").run();
    database.prepare("UPDATE Competition SET status = 'PUBLIC' WHERE id = 'competition-3'").run();
    applySchemaMigrations(database);
    expect(status("competition-1")).toBe("RUNNING");
    expect(status("competition-2")).toBe("ARCHIVED");
    expect(status("competition-3")).toBe("DRAFT");
  });

  it("adds scope, area, country and language columns", () => {
    applySchemaMigrations(database);
    expect(columns("Club")).toEqual(expect.arrayContaining(["area", "countryCode"]));
    expect(columns("User")).toContain("language");
    expect(columns("Competition")).toEqual(expect.arrayContaining(["scopeKind", "scopeValuesJson"]));

    const scope = database.prepare("SELECT scopeKind, scopeValuesJson FROM Competition WHERE id = 'competition-1'").get();
    expect(scope).toEqual({ scopeKind: "OPEN", scopeValuesJson: "[]" });
    insertUser("fresh", "USER", null);
    expect(database.prepare("SELECT language FROM User WHERE id = 'fresh'").get()).toEqual({ language: "en" });
  });

  it("club admins become co-admins of their club's competitions", () => {
    database.prepare("INSERT INTO Club (id, name, slug) VALUES ('c1', 'Club 1', 'c1')").run();
    insertUser("u1", "COMPETITION_ADMIN", "c1");
    insertUser("u2", "COMPETITION_ADMIN", null);
    insertUser("u3", "USER", "c1");
    database.prepare("UPDATE Competition SET clubId = 'c1' WHERE id = 'competition-1'").run();
    database.prepare("DELETE FROM Competition WHERE id = 'competition-2'").run();

    applySchemaMigrations(database);

    expect(adminRows()).toEqual([
      { competitionId: "competition-1", userId: "u1", role: "CO_ADMIN" },
      { competitionId: "competition-3", userId: "u1", role: "CO_ADMIN" },
      { competitionId: "competition-3", userId: "u2", role: "CO_ADMIN" },
    ]);
  });

  it("migrations are idempotent", () => {
    insertUser("u2", "COMPETITION_ADMIN", null);
    applySchemaMigrations(database);
    const admins = adminRows().length;
    const applied = (database.prepare("SELECT COUNT(*) AS count FROM SchemaMigration").get() as { count: number }).count;

    expect(() => applySchemaMigrations(database)).not.toThrow();
    expect(adminRows()).toHaveLength(admins);
    expect(database.prepare("SELECT COUNT(*) AS count FROM SchemaMigration").get()).toEqual({ count: applied });
    expect(applied).toBe(16);
  });
});

describe("live ring keeper", () => {
  it("backfills a keeper token for existing rings and adds the clock columns", () => {
    applySchemaMigrations(database);
    insertUser("creator", "USER", null);
    database.prepare("INSERT INTO LiveTournament (id, name, mode, layoutVersion, createdByUserId, createdAt) VALUES ('t', 't', 'SHEET', 'v3', 'creator', 'now')").run();
    // Rings from before the migration have no token: rerun the migration over them.
    database.prepare("DROP INDEX idx_liveRing_keeperToken").run();
    database.prepare("INSERT INTO LiveRing (id, tournamentId, name, \"order\") VALUES ('r1', 't', 'Ring 1', 1), ('r2', 't', 'Ring 2', 2)").run();
    database.prepare("DELETE FROM SchemaMigration WHERE name = '2026-10-26-live-ring-keeper'").run();
    applySchemaMigrations(database);
    const tokens = (database.prepare("SELECT keeperToken FROM LiveRing ORDER BY id").all() as Array<{ keeperToken: string }>).map((row) => row.keeperToken);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(columns("LiveRing")).toEqual(expect.arrayContaining(["activeDeviceId", "activeUserId", "activeSince"]));
    expect(columns("LiveBout")).toEqual(expect.arrayContaining(["clockSeconds", "clockRunning", "clockUpdatedAt"]));
    expect(() => database.prepare("UPDATE LiveRing SET keeperToken = ? WHERE id = 'r2'").run(tokens[0])).toThrow(/UNIQUE/);
  });
});

describe("participant status and sign-up settings", () => {
  it("existing participants become active and competitions get sign-up settings", () => {
    const before = (database.prepare("SELECT COUNT(*) AS count FROM CompetitionParticipant").get() as { count: number }).count;
    expect(before).toBeGreaterThan(0);
    applySchemaMigrations(database);
    expect(columns("CompetitionParticipant")).toEqual(expect.arrayContaining(["status", "joinedAt"]));
    expect(database.prepare("SELECT DISTINCT status FROM CompetitionParticipant").all()).toEqual([{ status: "ACTIVE" }]);
    expect(database.prepare("SELECT signupsNeedApproval, placeLimit, inviteCode FROM Competition WHERE id = 'competition-1'").get()).toEqual({
      signupsNeedApproval: 0,
      placeLimit: null,
      inviteCode: null,
    });
  });
});

describe("re-seeding after migrations", () => {
  it("seeds lifecycle statuses when the competition table is emptied", () => {
    applySchemaMigrations(database);
    database.prepare("DELETE FROM Competition").run();

    initializeCompetitionDatabase(database);

    const statuses = (database.prepare("SELECT DISTINCT status FROM Competition").all() as Array<{ status: string }>).map(
      (row) => row.status,
    );
    for (const value of statuses) {
      expect(["DRAFT", "REGISTRATION_OPEN", "RUNNING", "CLOSED", "ARCHIVED"]).toContain(value);
    }
  });
});

describe("table officials", () => {
  it("moves an existing table official into the new table", () => {
    applySchemaMigrations(database);
    database.prepare("DELETE FROM SchemaMigration WHERE name = '2026-10-20-bout-table-officials'").run();
    database.exec("DROP TABLE IF EXISTS BoutTableOfficial");
    for (const id of ["f1", "f2", "ref", "tab"]) {
      insertUser(id, "USER", null);
    }
    database
      .prepare(
        "INSERT INTO Bout (id, fighterAUserId, fighterBUserId, refereeUserId, tableUserId, startedAt, scoreA, scoreB, createdByUserId, status) VALUES ('b1', 'f1', 'f2', 'ref', 'tab', '2026-10-15T20:00:00.000Z', 1, 0, 'ref', 'SCORED')",
      )
      .run();

    applySchemaMigrations(database);

    expect(database.prepare("SELECT boutId, seat, userId FROM BoutTableOfficial").all()).toEqual([{ boutId: "b1", seat: 1, userId: "tab" }]);
  });
});

describe("bout tables", () => {
  it("creates the bout tables", () => {
    applySchemaMigrations(database);
    const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(tables).toEqual(expect.arrayContaining(["Bout", "BoutJury", "BoutCompetition", "BoutRevision"]));
    expect(columns("Bout")).toEqual(expect.arrayContaining(["objectionReason", "winnerSide", "exchangesJson"]));
  });
});
