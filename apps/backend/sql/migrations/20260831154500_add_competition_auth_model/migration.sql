PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE
);

INSERT INTO "Club" ("id", "name", "slug") VALUES ('club-legacy', 'Legacy Club', 'legacy-club');

-- Rebuild User to support club-scoped usernames and auth metadata.
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "judgeVolunteer" INTEGER NOT NULL DEFAULT 0,
    "juryVolunteer" INTEGER NOT NULL DEFAULT 0,
    "tableVolunteer" INTEGER NOT NULL DEFAULT 0,
    "otherVolunteer" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_User" ("id", "clubId", "username", "judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer")
SELECT "id", 'club-legacy', "username", "judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_clubId_username_key" ON "User"("clubId", "username");
CREATE INDEX "User_clubId_idx" ON "User"("clubId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "revokedAt" TEXT,
    "rememberMe" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnrollmentToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "expiresAt" TEXT NOT NULL,
    "consumedAt" TEXT,
    CONSTRAINT "EnrollmentToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "expiresAt" TEXT NOT NULL,
    "consumedAt" TEXT,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Rebuild Competition for visibility and club scoping.
CREATE TABLE "new_Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "status" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rulesetJson" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "clubId" TEXT,
    CONSTRAINT "Competition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Competition" ("id", "name", "slug", "status", "date", "rulesetJson")
SELECT "id", "name", "slug", "status", "date", "rulesetJson"
FROM "Competition";

DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";

CREATE INDEX "Competition_status_idx" ON "Competition"("status");
CREATE INDEX "Competition_date_idx" ON "Competition"("date");
CREATE INDEX "Competition_visibility_idx" ON "Competition"("visibility");
CREATE INDEX "Competition_clubId_idx" ON "Competition"("clubId");

-- Rebuild CompetitionParticipant so registrations can link to users and clubs.
CREATE TABLE "new_CompetitionParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "linkedUserEmail" TEXT,
    "linkedUserEmailHash" TEXT,
    "clubId" TEXT,
    "userId" TEXT,
    CONSTRAINT "CompetitionParticipant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitionParticipant_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CompetitionParticipant" ("id", "competitionId", "name", "displayName", "linkedUserEmail")
SELECT "id", "competitionId", "name", "name", "linkedUserEmail"
FROM "CompetitionParticipant";

DROP TABLE "CompetitionParticipant";
ALTER TABLE "new_CompetitionParticipant" RENAME TO "CompetitionParticipant";

CREATE INDEX "CompetitionParticipant_competitionId_idx" ON "CompetitionParticipant"("competitionId");
CREATE INDEX "CompetitionParticipant_userId_idx" ON "CompetitionParticipant"("userId");
CREATE INDEX "CompetitionParticipant_clubId_idx" ON "CompetitionParticipant"("clubId");
CREATE UNIQUE INDEX "CompetitionParticipant_competitionId_userId_key" ON "CompetitionParticipant"("competitionId", "userId");

CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key" ON "UserSession"("refreshTokenHash");
CREATE UNIQUE INDEX "EnrollmentToken_tokenHash_key" ON "EnrollmentToken"("tokenHash");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

PRAGMA foreign_keys=ON;
