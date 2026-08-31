PRAGMA foreign_keys=OFF;

UPDATE "StageOfficial"
SET "entryId" = (
  SELECT fighter."id"
  FROM "Entry" fighter
  JOIN "Entry" official
    ON official."tournamentId" = fighter."tournamentId"
   AND official."userId" = fighter."userId"
  WHERE official."id" = "StageOfficial"."entryId"
    AND fighter."kind" = 'FIGHTER'
    AND official."kind" = 'OFFICIAL'
)
WHERE "entryId" IN (
  SELECT official."id"
  FROM "Entry" official
  JOIN "Entry" fighter
    ON fighter."tournamentId" = official."tournamentId"
   AND fighter."userId" = official."userId"
  WHERE official."kind" = 'OFFICIAL' AND fighter."kind" = 'FIGHTER'
);

UPDATE "Entry"
SET "kind" = 'BOTH'
WHERE "kind" = 'FIGHTER'
  AND EXISTS (
    SELECT 1 FROM "Entry" official
    WHERE official."tournamentId" = "Entry"."tournamentId"
      AND official."userId" = "Entry"."userId"
      AND official."kind" = 'OFFICIAL'
  );

DELETE FROM "Entry"
WHERE "kind" = 'OFFICIAL'
  AND EXISTS (
    SELECT 1 FROM "Entry" combined
    WHERE combined."tournamentId" = "Entry"."tournamentId"
      AND combined."userId" = "Entry"."userId"
      AND combined."kind" = 'BOTH'
  );

CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIGHTER',
    "seed" INTEGER,
    CONSTRAINT "Entry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("id", "tournamentId", "userId", "kind", "seed") SELECT "id", "tournamentId", "userId", "kind", "seed" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE UNIQUE INDEX "Entry_tournamentId_userId_key" ON "Entry"("tournamentId", "userId");
CREATE INDEX "Entry_tournamentId_idx" ON "Entry"("tournamentId");
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
PRAGMA foreign_keys=ON;
