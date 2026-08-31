PRAGMA foreign_keys=OFF;

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
SELECT "id", "tournamentId", "userId", "kind", "seed" FROM "Entry";

DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE UNIQUE INDEX "Entry_tournamentId_userId_kind_key" ON "Entry"("tournamentId", "userId", "kind");
CREATE INDEX "Entry_tournamentId_idx" ON "Entry"("tournamentId");
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");

PRAGMA foreign_keys=ON;
