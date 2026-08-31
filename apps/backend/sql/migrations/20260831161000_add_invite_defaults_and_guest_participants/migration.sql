PRAGMA foreign_keys=OFF;

ALTER TABLE "EnrollmentToken" ADD COLUMN "defaultClubId" TEXT;
ALTER TABLE "CompetitionParticipant" ADD COLUMN "isGuest" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "EnrollmentToken_defaultClubId_idx" ON "EnrollmentToken"("defaultClubId");
CREATE INDEX IF NOT EXISTS "CompetitionParticipant_isGuest_idx" ON "CompetitionParticipant"("isGuest");

PRAGMA foreign_keys=ON;
