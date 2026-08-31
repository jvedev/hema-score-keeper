PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Ruleset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "minPoolSize" INTEGER NOT NULL DEFAULT 4,
    "maxPoolSize" INTEGER NOT NULL DEFAULT 6,
    "preferredPoolSize" INTEGER NOT NULL DEFAULT 5,
    "timeBetweenMatchesMinutes" INTEGER NOT NULL DEFAULT 2,
    "definition" JSONB,
    CONSTRAINT "Ruleset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Ruleset" ("id", "eventId", "name", "version", "minPoolSize", "maxPoolSize", "preferredPoolSize", "timeBetweenMatchesMinutes", "definition")
SELECT "id", "eventId", "name", "version", "minPoolSize", "maxPoolSize", "preferredPoolSize", "timeBetweenMatchesMinutes", "definition"
FROM "Ruleset";

DROP TABLE "Ruleset";
ALTER TABLE "new_Ruleset" RENAME TO "Ruleset";

CREATE UNIQUE INDEX "Ruleset_eventId_name_version_key" ON "Ruleset"("eventId", "name", "version");
CREATE INDEX "Ruleset_eventId_idx" ON "Ruleset"("eventId");
CREATE INDEX "Ruleset_eventId_name_idx" ON "Ruleset"("eventId", "name");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
