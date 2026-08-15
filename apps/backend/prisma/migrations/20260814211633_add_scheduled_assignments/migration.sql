-- CreateTable
CREATE TABLE "ScheduledAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledPhaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "ScheduledAssignment_scheduledPhaseId_fkey" FOREIGN KEY ("scheduledPhaseId") REFERENCES "ScheduledPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledAssignment_userId_idx" ON "ScheduledAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAssignment_scheduledPhaseId_role_key" ON "ScheduledAssignment"("scheduledPhaseId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAssignment_scheduledPhaseId_userId_key" ON "ScheduledAssignment"("scheduledPhaseId", "userId");
