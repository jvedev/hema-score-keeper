-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "skillLevel" INTEGER NOT NULL,
    CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "ruleset" TEXT
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIGHTER',
    "seed" INTEGER,
    CONSTRAINT "Entry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Arena" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Arena_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "ruleset" TEXT,
    CONSTRAINT "Stage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageArena" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "arenaId" TEXT NOT NULL,
    CONSTRAINT "StageArena_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StageArena_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageOfficial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "StageOfficial_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StageOfficial_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    CONSTRAINT "Round_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "arenaId" TEXT,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "winnerEntryId" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "ruleset" TEXT,
    CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_entryAId_fkey" FOREIGN KEY ("entryAId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_entryBId_fkey" FOREIGN KEY ("entryBId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "details" JSONB,
    CONSTRAINT "Exchange_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Skill_userId_idx" ON "Skill"("userId");

-- CreateIndex
CREATE INDEX "Entry_eventId_idx" ON "Entry"("eventId");

-- CreateIndex
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_eventId_userId_key" ON "Entry"("eventId", "userId");

-- CreateIndex
CREATE INDEX "Arena_eventId_idx" ON "Arena"("eventId");

-- CreateIndex
CREATE INDEX "Stage_eventId_idx" ON "Stage"("eventId");

-- CreateIndex
CREATE INDEX "StageArena_stageId_idx" ON "StageArena"("stageId");

-- CreateIndex
CREATE INDEX "StageArena_arenaId_idx" ON "StageArena"("arenaId");

-- CreateIndex
CREATE UNIQUE INDEX "StageArena_stageId_arenaId_key" ON "StageArena"("stageId", "arenaId");

-- CreateIndex
CREATE INDEX "StageOfficial_stageId_idx" ON "StageOfficial"("stageId");

-- CreateIndex
CREATE INDEX "StageOfficial_entryId_idx" ON "StageOfficial"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "StageOfficial_stageId_entryId_role_key" ON "StageOfficial"("stageId", "entryId", "role");

-- CreateIndex
CREATE INDEX "Round_stageId_idx" ON "Round"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_stageId_roundNumber_key" ON "Round"("stageId", "roundNumber");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_arenaId_idx" ON "Match"("arenaId");

-- CreateIndex
CREATE INDEX "Exchange_matchId_idx" ON "Exchange"("matchId");
