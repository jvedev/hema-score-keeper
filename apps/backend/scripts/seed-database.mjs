// Replaces all data in the configured database (DATABASE_URL / APP_DATA_DIR, default data/dev.db) with sample data.
// Needs a built backend: the database is opened through dist/, so it gets exactly the server's baseline schema
// (a missing database is created; a database from an older schema is refused). `npm run db:seed` builds first.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { access } from "node:fs/promises";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** Imports a module of the built backend, with a clear message when it has not been built. */
export async function importBackend(file) {
  const modulePath = path.join(distDir, file);
  try {
    await access(modulePath);
  } catch {
    throw new Error(`Missing ${modulePath}. Build the backend first: npm run build --workspace @hema/backend`);
  }
  return import(pathToFileURL(modulePath).href);
}

const defaultRuleset = {
  weaponClass: "Longsword",
  matchParameters: {
    maxDurationSeconds: 180,
    stopOnTimeOut: true,
    maxPointsCap: 10,
    pointSpreadVictory: 5,
    scores: [1, 2, 3, 4],
    maxDoubles: 3,
    allowAfterBlow: true,
    countDoubles: true,
    useNetScore: true,
    penalties: [
      { description: "Late in ring", penalties: [0], disqualify: true },
      { description: "Unsportsmanlike conduct", penalties: [0, 1, 2, 3], disqualify: true },
      { description: "Illegal target", penalties: [0, 1, 2, 3], disqualify: false },
      { description: "Bull rushing", penalties: [0, 1], disqualify: false },
    ],
  },
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

/** Deletes every row of every backend table, then inserts the sample event, users and competitions. */
export function seedDatabase(database, backendTables) {
  const insertUser = database.prepare(
    "INSERT INTO User (id, clubId, name, username, passwordHash, emailHash, role, status, judgeVolunteer, juryVolunteer, tableVolunteer, otherVolunteer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertSkill = database.prepare(
    "INSERT INTO Skill (id, userId, skillName, skillLevel) VALUES (?, ?, ?, ?)",
  );
  const insertEvent = database.prepare(
    "INSERT INTO Event (id, eventName, rulesetId, allFightersAreVolunteers) VALUES (?, ?, ?, ?)",
  );
  const insertEventColor = database.prepare(
    'INSERT INTO EventColor (id, eventId, name, preset, hex, "order") VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertEventSchedule = database.prepare(
    "INSERT INTO EventSchedule (id, eventId, startTimeMinutes, currentTimeSlotId) VALUES (?, ?, ?, ?)",
  );
  const insertScheduleTimeSlot = database.prepare(
    'INSERT INTO ScheduleTimeSlot (id, scheduleId, "order", durationMinutes, label, color, isBreak) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertTournament = database.prepare(
    'INSERT INTO Tournament (id, eventId, name, rulesetId, currentStageId, "order", color) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertEntry = database.prepare(
    "INSERT INTO Entry (id, tournamentId, userId, kind, seed) VALUES (?, ?, ?, ?, ?)",
  );
  const insertArena = database.prepare(
    'INSERT INTO Arena (id, eventId, name, "order", leftColor, rightColor) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertStage = database.prepare(
    "INSERT INTO Stage (id, tournamentId, type, name, rulesetId, minPoolSize, maxPoolSize, preferredPoolSize, eliminationParticipantCount, timeBetweenMatchesMinutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertScheduledPhase = database.prepare(
    "INSERT INTO ScheduledPhase (id, stageId, arenaId, timeSlotId) VALUES (?, ?, ?, ?)",
  );
  const insertScheduledAssignment = database.prepare(
    "INSERT INTO ScheduledAssignment (id, scheduledPhaseId, userId, role) VALUES (?, ?, ?, ?)",
  );
  const insertRound = database.prepare(
    "INSERT INTO Round (id, stageId, roundNumber) VALUES (?, ?, ?)",
  );
  const insertMatch = database.prepare(
    "INSERT INTO Match (id, roundId, arenaId, entryAId, entryBId, winnerEntryId, scoreA, scoreB, rulesetId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertExchange = database.prepare(
    "INSERT INTO Exchange (id, matchId, scoreA, scoreB, details) VALUES (?, ?, ?, ?, ?)",
  );
  const insertRuleset = database.prepare(
    "INSERT INTO Ruleset (id, eventId, name, version, definition) VALUES (?, ?, ?, ?, ?)",
  );

  const insertCompetition = database.prepare(
    "INSERT INTO Competition (id, name, slug, status, date, rulesetJson) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertCompetitionParticipant = database.prepare(
    "INSERT INTO CompetitionParticipant (id, competitionId, name, linkedUserEmail, kind) VALUES (?, ?, ?, ?, ?)",
  );
  const insertCompetitionBout = database.prepare(
    "INSERT INTO CompetitionBout (id, competitionId, fighterAId, fighterBId, scoreA, scoreB, winnerParticipantId, date, published, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertClub = database.prepare(
    "INSERT INTO Club (id, name, slug) VALUES (?, ?, ?)",
  );

  function clearDatabase() {
    // Deferred foreign keys: rows may go in any order; every reference is checked at commit.
    database.pragma("defer_foreign_keys = ON");
    for (const table of [...backendTables].reverse()) {
      database.prepare(`DELETE FROM "${table}"`).run();
    }
  }

  function main() {
    const ids = {
      club: "club-legacy",
      event: crypto.randomUUID(),
      ruleset: crypto.randomUUID(),
      tournament: crypto.randomUUID(),
      poolStage: crypto.randomUUID(),
      arenaA: crypto.randomUUID(),
      arenaB: crypto.randomUUID(),
      schedule: crypto.randomUUID(),
      slot1: crypto.randomUUID(),
      phase1: crypto.randomUUID(),
      phase2: crypto.randomUUID(),
      round: crypto.randomUUID(),
    };

    const users = [
      { id: crypto.randomUUID(), name: "Alex 'The Blade' Visser", username: "Alex 'The Blade' Visser", seed: 1 },
      { id: crypto.randomUUID(), name: "Beatrix de Ruiter", username: "Beatrix de Ruiter", seed: 2 },
      { id: crypto.randomUUID(), name: "Casper van Dam", username: "Casper van Dam", seed: 3 },
      { id: crypto.randomUUID(), name: "Daan Bakker", username: "Daan Bakker", seed: 4 },
      { id: crypto.randomUUID(), name: "Elena 'Shield' Smit", username: "Elena 'Shield' Smit", seed: 5 },
      { id: crypto.randomUUID(), name: "Floris de Jong", username: "Floris de Jong", seed: 6 },
      { id: crypto.randomUUID(), name: "Gijs Jansen", username: "Gijs Jansen", seed: 7 },
      { id: crypto.randomUUID(), name: "Hanna Meijer", username: "Hanna Meijer", seed: 8 },
    ];
    const initialAdmin = {
      id: "user-jeroen",
      name: "Jeroen",
      username: "jeroen",
      passwordHash: hashPassword("zwaard"),
      role: "COMPETITION_ADMIN",
      clubId: ids.club,
    };

    const competition1 = {
      id: "competition-1",
      name: "Autumn Longsword Open",
      slug: "autumn-longsword-open",
      status: "RUNNING",
      date: "2026-09-12",
      participants: [
        { id: "participant-1", name: "Alex Meyer", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-2", name: "Blake Novak", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-3", name: "Casey Silva", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-4", name: "Drew Fischer", linkedUserEmail: null, kind: "MEMBER" },
      ],
      bouts: [
        {
          id: "bout-1",
          fighterAId: "participant-1",
          fighterBId: "participant-2",
          scoreA: 5,
          scoreB: 3,
          winnerParticipantId: "participant-1",
          date: "2026-09-12",
          details: { note: "Pool bout 1" },
        },
        {
          id: "bout-2",
          fighterAId: "participant-3",
          fighterBId: "participant-4",
          scoreA: 2,
          scoreB: 2,
          winnerParticipantId: null,
          date: "2026-09-12",
          details: { note: "Pool bout 2" },
        },
      ],
    };

    const competition2 = {
      id: "competition-2",
      name: "Winter Sabre Cup",
      slug: "winter-sabre-cup",
      status: "ARCHIVED",
      date: "2026-12-05",
      participants: [
        { id: "participant-5", name: "Emery Janssen", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-6", name: "Frankie Ruiz", linkedUserEmail: null, kind: "MEMBER" },
      ],
      bouts: [
        {
          id: "bout-3",
          fighterAId: "participant-5",
          fighterBId: "participant-6",
          scoreA: 4,
          scoreB: 1,
          winnerParticipantId: "participant-5",
          date: "2026-12-05",
          details: { note: "Knockout bout" },
        },
      ],
    };

    const competition3 = {
      id: "competition-3",
      name: "Spring Rapier Challenge",
      slug: "spring-rapier-challenge",
      status: "DRAFT",
      date: "2027-03-21",
      participants: [],
      bouts: [],
    };

    const seedTransaction = database.transaction(() => {
      clearDatabase();

      insertClub.run(ids.club, "Legacy Club", "legacy-club");
      insertEvent.run(ids.event, "HEMA Championship 2026", null, 1);
      // The default palette of a new Event (see DEFAULT_EVENT_COLORS in src/events/event-colors.ts).
      insertEventColor.run(crypto.randomUUID(), ids.event, null, "RED", "#d62828", 0);
      insertEventColor.run(crypto.randomUUID(), ids.event, null, "BLUE", "#2f7dfa", 1);
      insertRuleset.run(ids.ruleset, ids.event, "Longsword Standard", 1, JSON.stringify({
        weaponClass: "",
        matchParameters: defaultRuleset.matchParameters,
      }));
      database.prepare("UPDATE Event SET rulesetId = ? WHERE id = ?").run(ids.ruleset, ids.event);

      insertTournament.run(ids.tournament, ids.event, "Open Steel Longsword", ids.ruleset, null, 0, "#5B8CFF");
      insertStage.run(
        ids.poolStage,
        ids.tournament,
        "POOL",
        "Pool Phase",
        ids.ruleset,
        4,
        6,
        4,
        null,
        2,
      );
      database.prepare("UPDATE Tournament SET currentStageId = ? WHERE id = ?").run(ids.poolStage, ids.tournament);

      insertArena.run(ids.arenaA, ids.event, "Arena A (Pool 1)", 0, "#d62828", "#2f7dfa");
      insertArena.run(ids.arenaB, ids.event, "Arena B (Pool 2)", 1, "#d62828", "#2f7dfa");

      insertEventSchedule.run(ids.schedule, ids.event, 540, null);
      insertScheduleTimeSlot.run(ids.slot1, ids.schedule, 0, 60, "Ronde 1 - Pools", null, 0);
      database.prepare("UPDATE EventSchedule SET currentTimeSlotId = ? WHERE id = ?").run(ids.slot1, ids.schedule);

      insertScheduledPhase.run(ids.phase1, ids.poolStage, ids.arenaA, ids.slot1);
      insertScheduledPhase.run(ids.phase2, ids.poolStage, ids.arenaB, ids.slot1);

      insertUser.run(
        initialAdmin.id,
        initialAdmin.clubId,
        initialAdmin.name,
        initialAdmin.username,
        initialAdmin.passwordHash,
        null,
        initialAdmin.role,
        "ACTIVE",
        0,
        0,
        0,
        0,
      );
      // Development-only system administrator for manual and browser checks (username "admin",
      // password "zwaard", like the competition admin above). Never use the seed in production.
      insertUser.run("user-dev-admin", ids.club, "Dev admin", "admin", hashPassword("zwaard"), null, "SYSTEM_ADMIN", "ACTIVE", 0, 0, 0, 0);

      for (const user of users) {
        insertUser.run(user.id, ids.club, user.name, user.username, null, null, "USER", "ACTIVE", 0, 0, 0, 0);
        insertSkill.run(crypto.randomUUID(), user.id, `Skill ${user.seed}`, user.seed);
      }

      for (let index = 0; index < 8; index++) {
        const user = users[index];
        const entryKind = index < 4 ? "BOTH" : "FIGHTER";
        insertEntry.run(crypto.randomUUID(), ids.tournament, user.id, entryKind, index + 1);
      }

      const entryRows = database.prepare("SELECT id, userId FROM Entry WHERE tournamentId = ? ORDER BY seed").all(ids.tournament);

      for (let i = 0; i < 4; i++) {
        insertScheduledAssignment.run(crypto.randomUUID(), ids.phase1, users[i].id, "FIGHTER");
      }
      for (let i = 4; i < 8; i++) {
        insertScheduledAssignment.run(crypto.randomUUID(), ids.phase2, users[i].id, "FIGHTER");
      }

      insertRound.run(ids.round, ids.poolStage, 0);

      const pool1MatchResults = [
        { iA: 0, iB: 1, scoreA: 5, scoreB: 2, winner: 0, exchanges: [{ scoreA: 2, scoreB: 0 }, { scoreA: 5, scoreB: 2 }] },
        { iA: 2, iB: 3, scoreA: 3, scoreB: 4, winner: 3, exchanges: [{ scoreA: 1, scoreB: 2 }, { scoreA: 3, scoreB: 4 }] },
        { iA: 0, iB: 2, scoreA: 5, scoreB: 1, winner: 0, exchanges: [{ scoreA: 3, scoreB: 0 }, { scoreA: 5, scoreB: 1 }] },
        { iA: 1, iB: 3, scoreA: 4, scoreB: 2, winner: 1, exchanges: [{ scoreA: 2, scoreB: 1 }, { scoreA: 4, scoreB: 2 }] },
        { iA: 0, iB: 3, scoreA: 5, scoreB: 3, winner: 0, exchanges: [{ scoreA: 2, scoreB: 2 }, { scoreA: 5, scoreB: 3 }] },
        { iA: 1, iB: 2, scoreA: 3, scoreB: 3, winner: null, exchanges: [{ scoreA: 1, scoreB: 1 }, { scoreA: 3, scoreB: 3 }] },
      ];

      const entryByIndex = entryRows.slice(0, 4).map((row) => row.id);
      for (const res of pool1MatchResults) {
        const matchId = crypto.randomUUID();
        insertMatch.run(
          matchId,
          ids.round,
          ids.arenaA,
          entryByIndex[res.iA],
          entryByIndex[res.iB],
          res.winner !== null ? entryByIndex[res.winner] : null,
          res.scoreA,
          res.scoreB,
          ids.ruleset,
        );
        for (const ex of res.exchanges) {
          insertExchange.run(crypto.randomUUID(), matchId, ex.scoreA, ex.scoreB, JSON.stringify({ note: `Exchange score ${ex.scoreA}-${ex.scoreB}` }));
        }
      }

      const pool2Results = [
        { iA: 0, iB: 1, completed: true, scoreA: 4, scoreB: 1, winner: 0, exchanges: [{ scoreA: 2, scoreB: 0 }, { scoreA: 4, scoreB: 1 }] },
        { iA: 2, iB: 3, completed: false },
        { iA: 0, iB: 2, completed: false },
        { iA: 1, iB: 3, completed: false },
        { iA: 0, iB: 3, completed: false },
        { iA: 1, iB: 2, completed: false },
      ];

      const pool2EntryIds = entryRows.slice(4, 8).map((row) => row.id);
      for (const res of pool2Results) {
        const matchId = crypto.randomUUID();
        if (res.completed) {
          insertMatch.run(
            matchId,
            ids.round,
            ids.arenaB,
            pool2EntryIds[res.iA],
            pool2EntryIds[res.iB],
            res.winner !== null ? pool2EntryIds[res.winner] : null,
            res.scoreA,
            res.scoreB,
            ids.ruleset,
          );
          for (const ex of res.exchanges) {
            insertExchange.run(crypto.randomUUID(), matchId, ex.scoreA, ex.scoreB, JSON.stringify({ note: `Exchange score ${ex.scoreA}-${ex.scoreB}` }));
          }
        } else {
          insertMatch.run(
            matchId,
            ids.round,
            ids.arenaB,
            pool2EntryIds[res.iA],
            pool2EntryIds[res.iB],
            null,
            null,
            null,
            ids.ruleset,
          );
        }
      }

      for (const competition of [competition1, competition2, competition3]) {
        insertCompetition.run(
          competition.id,
          competition.name,
          competition.slug,
          competition.status,
          competition.date,
          JSON.stringify(defaultRuleset),
        );

        for (const participant of competition.participants) {
          insertCompetitionParticipant.run(
            participant.id,
            competition.id,
            participant.name,
            participant.linkedUserEmail,
            participant.kind,
          );
        }

        for (const bout of competition.bouts) {
          insertCompetitionBout.run(
            bout.id,
            competition.id,
            bout.fighterAId,
            bout.fighterBId,
            bout.scoreA,
            bout.scoreB,
            bout.winnerParticipantId,
            bout.date,
            1,
            JSON.stringify(bout.details),
          );
        }

        database
          .prepare("INSERT INTO CompetitionAdmin (competitionId, userId, role) VALUES (?, ?, 'OWNER')")
          .run(competition.id, initialAdmin.id);
      }
    });

    seedTransaction();
    console.log("Database successfully seeded with sample data.");
  }

  main();
}

async function runFromCommandLine() {
  const { openNativeDatabase, resolveDatabasePath } = await importBackend("native-database.js");
  const { BACKEND_TABLES } = await importBackend("schema.js");
  console.log(`Database: ${resolveDatabasePath()}`);
  const database = openNativeDatabase();
  const { seedDemoCompetitionsIfEmpty } = await importBackend("competition-bootstrap.js");
  try {
    seedDatabase(database, BACKEND_TABLES);
    seedDemoCompetitionsIfEmpty(database);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
