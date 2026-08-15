PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rulesetId" TEXT,
    "currentStageId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#5B8CFF',
    CONSTRAINT "Tournament_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tournament_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "Stage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tournament_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Tournament" ("id", "eventId", "name", "rulesetId", "order", "color")
SELECT "id", "eventId", "name", "rulesetId", "order", "color"
FROM "Tournament";

DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";

CREATE UNIQUE INDEX "Tournament_currentStageId_key" ON "Tournament"("currentStageId");
CREATE INDEX "Tournament_eventId_idx" ON "Tournament"("eventId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
