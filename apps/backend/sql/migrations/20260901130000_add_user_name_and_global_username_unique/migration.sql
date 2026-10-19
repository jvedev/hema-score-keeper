PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT,
    "name" TEXT NOT NULL,
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

INSERT INTO "new_User" ("id", "clubId", "name", "username", "passwordHash", "emailHash", "role", "status", "judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer")
SELECT "id", "clubId", "username", "username", "passwordHash", "emailHash", "role", "status", "judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_clubId_idx" ON "User"("clubId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

PRAGMA foreign_keys=ON;
