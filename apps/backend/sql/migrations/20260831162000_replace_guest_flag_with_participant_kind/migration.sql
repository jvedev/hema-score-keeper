PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CompetitionParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "linkedUserEmail" TEXT,
    "linkedUserEmailHash" TEXT,
    "clubId" TEXT,
    "userId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MEMBER',
    CONSTRAINT "CompetitionParticipant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitionParticipant_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CompetitionParticipant" ("id", "competitionId", "name", "displayName", "linkedUserEmail", "linkedUserEmailHash", "clubId", "userId", "kind")
SELECT
    "id",
    "competitionId",
    "name",
    "displayName",
    "linkedUserEmail",
    "linkedUserEmailHash",
    "clubId",
    "userId",
    CASE WHEN "isGuest" = 1 THEN 'GUEST' ELSE 'MEMBER' END
FROM "CompetitionParticipant";

DROP TABLE "CompetitionParticipant";
ALTER TABLE "new_CompetitionParticipant" RENAME TO "CompetitionParticipant";

CREATE INDEX "CompetitionParticipant_competitionId_idx" ON "CompetitionParticipant"("competitionId");
CREATE INDEX "CompetitionParticipant_userId_idx" ON "CompetitionParticipant"("userId");
CREATE INDEX "CompetitionParticipant_clubId_idx" ON "CompetitionParticipant"("clubId");
CREATE INDEX "CompetitionParticipant_kind_idx" ON "CompetitionParticipant"("kind");
CREATE UNIQUE INDEX "CompetitionParticipant_competitionId_userId_key" ON "CompetitionParticipant"("competitionId", "userId");

PRAGMA foreign_keys=ON;
