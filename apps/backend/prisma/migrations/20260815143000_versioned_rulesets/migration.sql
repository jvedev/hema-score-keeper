-- CreateTable
CREATE TABLE "Ruleset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "minPoolSize" INTEGER NOT NULL DEFAULT 4,
    "maxPoolSize" INTEGER NOT NULL DEFAULT 6,
    "preferredPoolSize" INTEGER NOT NULL DEFAULT 5,
    "timeBetweenMatchesMinutes" INTEGER NOT NULL DEFAULT 2,
    CONSTRAINT "Ruleset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

INSERT INTO "Ruleset" ("id", "eventId", "name", "version", "minPoolSize", "maxPoolSize", "preferredPoolSize", "timeBetweenMatchesMinutes")
SELECT lower(hex(randomblob(16))), source."eventId", source."name", 1, 4, 6, 5, 2
FROM (
    SELECT "id" AS "eventId", "ruleset" AS "name"
    FROM "Event"
    WHERE "ruleset" IS NOT NULL
    UNION
    SELECT "eventId" AS "eventId", "ruleset" AS "name"
    FROM "Tournament"
    WHERE "ruleset" IS NOT NULL
    UNION
    SELECT "Tournament"."eventId" AS "eventId", "Stage"."ruleset" AS "name"
    FROM "Stage"
    INNER JOIN "Tournament" ON "Tournament"."id" = "Stage"."tournamentId"
    WHERE "Stage"."ruleset" IS NOT NULL
    UNION
    SELECT "Tournament"."eventId" AS "eventId", "Match"."ruleset" AS "name"
    FROM "Match"
    INNER JOIN "Round" ON "Round"."id" = "Match"."roundId"
    INNER JOIN "Stage" ON "Stage"."id" = "Round"."stageId"
    INNER JOIN "Tournament" ON "Tournament"."id" = "Stage"."tournamentId"
    WHERE "Match"."ruleset" IS NOT NULL
) AS source;

-- RedefineTables
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "rulesetId" TEXT,
    "allFightersAreVolunteers" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Event_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("id", "eventName", "rulesetId", "allFightersAreVolunteers")
SELECT "Event"."id",
       "Event"."eventName",
       (
         SELECT "Ruleset"."id"
         FROM "Ruleset"
         WHERE "Ruleset"."eventId" = "Event"."id"
           AND "Ruleset"."name" = "Event"."ruleset"
         LIMIT 1
       ) AS "rulesetId",
       "Event"."allFightersAreVolunteers"
FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";

CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rulesetId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#5B8CFF',
    CONSTRAINT "Tournament_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tournament_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("id", "eventId", "name", "rulesetId", "order", "color")
SELECT "Tournament"."id",
       "Tournament"."eventId",
       "Tournament"."name",
       (
         SELECT "Ruleset"."id"
         FROM "Ruleset"
         WHERE "Ruleset"."eventId" = "Tournament"."eventId"
           AND "Ruleset"."name" = "Tournament"."ruleset"
         LIMIT 1
       ) AS "rulesetId",
       "Tournament"."order",
       "Tournament"."color"
FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";

CREATE TABLE "new_Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rulesetId" TEXT,
    CONSTRAINT "Stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stage_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Stage" ("id", "tournamentId", "type", "name", "rulesetId")
SELECT "Stage"."id",
       "Stage"."tournamentId",
       "Stage"."type",
       "Stage"."name",
       (
         SELECT "Ruleset"."id"
         FROM "Ruleset"
         WHERE "Ruleset"."eventId" = "Tournament"."eventId"
           AND "Ruleset"."name" = "Stage"."ruleset"
         LIMIT 1
       ) AS "rulesetId"
FROM "Stage"
INNER JOIN "Tournament" ON "Tournament"."id" = "Stage"."tournamentId";
DROP TABLE "Stage";
ALTER TABLE "new_Stage" RENAME TO "Stage";

CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "arenaId" TEXT,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "winnerEntryId" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "rulesetId" TEXT,
    CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_entryAId_fkey" FOREIGN KEY ("entryAId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_entryBId_fkey" FOREIGN KEY ("entryBId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("id", "roundId", "arenaId", "entryAId", "entryBId", "winnerEntryId", "scoreA", "scoreB", "rulesetId")
SELECT "Match"."id",
       "Match"."roundId",
       "Match"."arenaId",
       "Match"."entryAId",
       "Match"."entryBId",
       "Match"."winnerEntryId",
       "Match"."scoreA",
       "Match"."scoreB",
       (
         SELECT "Ruleset"."id"
         FROM "Ruleset"
         WHERE "Ruleset"."eventId" = "Tournament"."eventId"
           AND "Ruleset"."name" = "Match"."ruleset"
         LIMIT 1
       ) AS "rulesetId"
FROM "Match"
INNER JOIN "Round" ON "Round"."id" = "Match"."roundId"
INNER JOIN "Stage" ON "Stage"."id" = "Round"."stageId"
INNER JOIN "Tournament" ON "Tournament"."id" = "Stage"."tournamentId";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Ruleset_eventId_idx" ON "Ruleset"("eventId");

-- CreateIndex
CREATE INDEX "Ruleset_eventId_name_idx" ON "Ruleset"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ruleset_eventId_name_version_key" ON "Ruleset"("eventId", "name", "version");

-- CreateIndex
CREATE INDEX "Tournament_eventId_idx" ON "Tournament"("eventId");

-- CreateIndex
CREATE INDEX "Stage_tournamentId_idx" ON "Stage"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_arenaId_idx" ON "Match"("arenaId");
