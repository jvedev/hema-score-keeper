PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_EventSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "startTimeMinutes" INTEGER NOT NULL DEFAULT 540,
    "currentTimeSlotId" TEXT,
    CONSTRAINT "EventSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventSchedule_currentTimeSlotId_fkey" FOREIGN KEY ("currentTimeSlotId") REFERENCES "ScheduleTimeSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_EventSchedule" ("id", "eventId", "startTimeMinutes")
SELECT "id", "eventId", "startTimeMinutes"
FROM "EventSchedule";

DROP TABLE "EventSchedule";
ALTER TABLE "new_EventSchedule" RENAME TO "EventSchedule";

CREATE UNIQUE INDEX "EventSchedule_eventId_key" ON "EventSchedule"("eventId");
CREATE UNIQUE INDEX "EventSchedule_currentTimeSlotId_key" ON "EventSchedule"("currentTimeSlotId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
