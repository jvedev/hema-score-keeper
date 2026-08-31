ALTER TABLE "Tournament" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#5B8CFF';

UPDATE "Tournament" AS current
SET "color" = CASE (
  SELECT COUNT(*)
  FROM "Tournament" AS previous
  WHERE previous."eventId" = current."eventId"
    AND (previous."order" < current."order" OR (previous."order" = current."order" AND previous."id" < current."id"))
) % 6
  WHEN 0 THEN '#5B8CFF'
  WHEN 1 THEN '#E06C75'
  WHEN 2 THEN '#98C379'
  WHEN 3 THEN '#E5C07B'
  WHEN 4 THEN '#C678DD'
  ELSE '#56B6C2'
END;
