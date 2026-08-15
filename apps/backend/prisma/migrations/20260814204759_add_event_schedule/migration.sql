-- CreateTable
CREATE TABLE "EventSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "startTimeMinutes" INTEGER NOT NULL DEFAULT 540,
    CONSTRAINT "EventSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleTimeSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScheduleTimeSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "EventSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledPhase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "arenaId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    CONSTRAINT "ScheduledPhase_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledPhase_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledPhase_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "ScheduleTimeSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSchedule_eventId_key" ON "EventSchedule"("eventId");

-- CreateIndex
CREATE INDEX "ScheduleTimeSlot_scheduleId_idx" ON "ScheduleTimeSlot"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTimeSlot_scheduleId_order_key" ON "ScheduleTimeSlot"("scheduleId", "order");

-- CreateIndex
CREATE INDEX "ScheduledPhase_stageId_idx" ON "ScheduledPhase"("stageId");

-- CreateIndex
CREATE INDEX "ScheduledPhase_timeSlotId_idx" ON "ScheduledPhase"("timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPhase_arenaId_timeSlotId_key" ON "ScheduledPhase"("arenaId", "timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPhase_stageId_arenaId_timeSlotId_key" ON "ScheduledPhase"("stageId", "arenaId", "timeSlotId");
