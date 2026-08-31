-- Add stage-owned settings
ALTER TABLE "Stage" ADD COLUMN "minPoolSize" INTEGER;
ALTER TABLE "Stage" ADD COLUMN "maxPoolSize" INTEGER;
ALTER TABLE "Stage" ADD COLUMN "preferredPoolSize" INTEGER;
ALTER TABLE "Stage" ADD COLUMN "eliminationParticipantCount" INTEGER;
ALTER TABLE "Stage" ADD COLUMN "timeBetweenMatchesMinutes" INTEGER NOT NULL DEFAULT 2;

UPDATE "Stage" AS "S"
SET
  "minPoolSize" = CASE
    WHEN "S"."type" = 'POOL' THEN COALESCE((SELECT "minPoolSize" FROM "Ruleset" WHERE "id" = "S"."rulesetId"), 4)
    ELSE NULL
  END,
  "maxPoolSize" = CASE
    WHEN "S"."type" = 'POOL' THEN COALESCE((SELECT "maxPoolSize" FROM "Ruleset" WHERE "id" = "S"."rulesetId"), 6)
    ELSE NULL
  END,
  "preferredPoolSize" = CASE
    WHEN "S"."type" = 'POOL' THEN COALESCE((SELECT "preferredPoolSize" FROM "Ruleset" WHERE "id" = "S"."rulesetId"), 5)
    ELSE NULL
  END,
  "eliminationParticipantCount" = CASE
    WHEN "S"."type" = 'ELIMINATION' THEN COALESCE(
      (SELECT "PoolStage"."preferredPoolSize"
       FROM "Stage" AS "PoolStage"
       WHERE "PoolStage"."tournamentId" = "S"."tournamentId"
         AND "PoolStage"."type" = 'POOL'
         AND "PoolStage"."preferredPoolSize" IS NOT NULL
       LIMIT 1),
      (SELECT "preferredPoolSize" FROM "Ruleset" WHERE "id" = "S"."rulesetId"),
      5
    )
    ELSE NULL
  END,
  "timeBetweenMatchesMinutes" = COALESCE((SELECT "timeBetweenMatchesMinutes" FROM "Ruleset" WHERE "id" = "S"."rulesetId"), 2);

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Ruleset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Ruleset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Ruleset" ("id", "eventId", "name", "version")
SELECT "id", "eventId", "name", "version"
FROM "Ruleset";

DROP TABLE "Ruleset";
ALTER TABLE "new_Ruleset" RENAME TO "Ruleset";

PRAGMA foreign_keys=ON;

CREATE INDEX "Ruleset_eventId_idx" ON "Ruleset"("eventId");
CREATE INDEX "Ruleset_eventId_name_idx" ON "Ruleset"("eventId", "name");
CREATE UNIQUE INDEX "Ruleset_eventId_name_version_key" ON "Ruleset"("eventId", "name", "version");
