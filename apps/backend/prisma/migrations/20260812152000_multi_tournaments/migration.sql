PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleset" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Tournament_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Tournament_eventId_idx" ON "Tournament"("eventId");

-- Seed a default tournament for every existing event so legacy data stays reachable.
INSERT INTO "Tournament" ("id", "eventId", "name", "ruleset", "order")
SELECT "id", "id", "eventName", "ruleset", 0
FROM "Event";

-- CreateTable
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIGHTER',
    "seed" INTEGER,
    CONSTRAINT "Entry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Entry" ("id", "tournamentId", "userId", "kind", "seed")
SELECT "id", "eventId", "userId", "kind", "seed"
FROM "Entry";

DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";

-- CreateIndex
CREATE INDEX "Entry_tournamentId_idx" ON "Entry"("tournamentId");

-- CreateIndex
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_tournamentId_userId_key" ON "Entry"("tournamentId", "userId");

-- CreateTable
CREATE TABLE "new_Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "ruleset" TEXT,
    CONSTRAINT "Stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Stage" ("id", "tournamentId", "type", "name", "ruleset")
SELECT "id", "eventId", "type", "name", "ruleset"
FROM "Stage";

DROP TABLE "Stage";
ALTER TABLE "new_Stage" RENAME TO "Stage";

-- CreateIndex
CREATE INDEX "Stage_tournamentId_idx" ON "Stage"("tournamentId");

PRAGMA foreign_keys=ON;
