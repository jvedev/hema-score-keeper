import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { requireAdminUser, requirePathParam, type AccessUser } from "../access-user.js";
import { generateToken } from "../auth.js";
import { requireUser } from "../bouts/bout-routes.js";
import { requireCompetition, type CompetitionDetail } from "../competition-model.js";
import type { BackendDatabase, DbExecutor, ParticipantStatus } from "../db.js";
import { ensureObject, HttpError, requireBoolean, requireString } from "../http.js";
import { generateId, requireUserRow } from "../read-model.js";
import { competitionAdminRole, requireCompetitionAccess, requireCompetitionAdmin } from "./access.js";
import { checkJoin, joinRefusalError, PLACE_HOLDING_STATUSES } from "./joining.js";

/** `POST /competitions/:id/signup`: where the fighter now stands. */
export interface SignupResult {
  status: Exclude<ParticipantStatus, "LEFT">;
}

/**
 * `DELETE /competitions/:id/signup`: LEFT, or null when a pending sign-up without history was withdrawn (its row is gone).
 * A pending fighter who fought here before goes back to LEFT, so their bouts stay.
 */
export interface LeaveResult {
  status: "LEFT" | null;
}

/** `GET /invites/:code`, no login needed. `joinable` ignores scope (the invite lets people past it). */
export interface InvitePreview {
  competitionId: string;
  name: string;
  status: string;
  date: string;
  joinable: boolean;
}

/** `POST /competitions/:id/invite`: the new code; the old one stops working. */
export interface NewInvite {
  inviteCode: string;
}

/**
 * `POST /competitions/:id/participants/:participantId/decision`: ACTIVE when accepted. Declined: null (row removed),
 * or LEFT for a fighter who fought here before and asked to come back.
 */
export interface SignupDecisionResult {
  participantId: string;
  status: "ACTIVE" | "LEFT" | null;
}

/** A competition as its admins read it: with the current invite code (null until one is made). */
export type AdminCompetitionDetail = CompetitionDetail & { inviteCode: string | null };

/** Adds the invite code when `user` manages the competition; everyone else gets the competition unchanged. */
export async function withInviteCodeForAdmins(
  executor: DbExecutor,
  user: AccessUser | null,
  competition: CompetitionDetail,
): Promise<CompetitionDetail | AdminCompetitionDetail> {
  if (user === null || (await competitionAdminRole(executor, user, competition.id)) === null) {
    return competition;
  }
  const row = await executor.selectFrom("Competition").select("inviteCode").where("id", "=", competition.id).executeTakeFirstOrThrow();
  return { ...competition, inviteCode: row.inviteCode };
}

/** Whether the participant has bouts in the competition (legacy or new); such a row must never be deleted. */
async function hasBouts(executor: DbExecutor, competitionId: string, participantId: string, userId: string | null): Promise<boolean> {
  const legacy = await executor
    .selectFrom("CompetitionBout")
    .select("id")
    .where("competitionId", "=", competitionId)
    .where((eb) => eb.or([eb("fighterAId", "=", participantId), eb("fighterBId", "=", participantId)]))
    .executeTakeFirst();
  if (legacy !== undefined || userId === null) {
    return legacy !== undefined;
  }
  const linked = await executor
    .selectFrom("Bout")
    .innerJoin("BoutCompetition", "BoutCompetition.boutId", "Bout.id")
    .select("Bout.id")
    .where("BoutCompetition.competitionId", "=", competitionId)
    .where((eb) => eb.or([eb("Bout.fighterAUserId", "=", userId), eb("Bout.fighterBUserId", "=", userId)]))
    .executeTakeFirst();
  return linked !== undefined;
}

/**
 * Ends a pending sign-up (withdrawn or declined). A fighter with bouts here goes back to LEFT: deleting the row
 * would cascade to legacy bouts and drop new ones from the standings. Anyone else's row is removed.
 */
async function endPendingSignup(
  executor: DbExecutor,
  competitionId: string,
  participant: { id: string; userId: string | null },
): Promise<"LEFT" | null> {
  if (await hasBouts(executor, competitionId, participant.id, participant.userId)) {
    await executor.updateTable("CompetitionParticipant").set({ status: "LEFT" }).where("id", "=", participant.id).execute();
    return "LEFT";
  }
  await executor.deleteFrom("CompetitionParticipant").where("id", "=", participant.id).execute();
  return null;
}

/** A closed or archived competition is over: nobody leaves it and no sign-ups are decided. */
const ENDED_STATUSES: ReadonlySet<string> = new Set(["CLOSED", "ARCHIVED"]);

export function registerSignupRoutes(app: FastifyInstance, database: Kysely<BackendDatabase>): void {
  app.post("/api/v1/competitions/:id/signup", async (request): Promise<SignupResult> => {
    const user = await requireUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const body = ensureObject(request.body ?? {}, "Sign-up");
    const inviteCode = body.inviteCode === undefined || body.inviteCode === null ? undefined : requireString(body.inviteCode, "Invite code");

    // Checking and writing in one transaction: two sign-ups at once can't both take the last place.
    const status = await database.transaction().execute(async (transaction) => {
      const check = await checkJoin(transaction, competitionId, user.id, inviteCode);
      // Without a valid invite, a competition the fighter may not see doesn't exist for them.
      if (!check.invited) {
        await requireCompetitionAccess(transaction, user, check.competition);
      }
      if (check.refusal !== null) {
        throw joinRefusalError(check.refusal);
      }
      const status: SignupResult["status"] = check.competition.signupsNeedApproval === 1 ? "PENDING" : "ACTIVE";
      const joinedAt = app.now().toISOString();
      if (check.participant !== null) {
        // Someone who left joins again on their old row, so their history stays in one place.
        await transaction.updateTable("CompetitionParticipant").set({ status, joinedAt }).where("id", "=", check.participant.id).execute();
      } else {
        const fighter = await requireUserRow(transaction, user.id);
        await transaction
          .insertInto("CompetitionParticipant")
          .values({
            id: generateId(),
            competitionId,
            name: fighter.name,
            displayName: fighter.name,
            linkedUserEmail: null,
            linkedUserEmailHash: null,
            clubId: fighter.clubId,
            userId: fighter.id,
            kind: "MEMBER",
            status,
            joinedAt,
          })
          .execute();
      }
      return status;
    });
    return { status };
  });

  app.delete("/api/v1/competitions/:id/signup", async (request): Promise<LeaveResult> => {
    const user = await requireUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const competition = await requireCompetition(database, competitionId);

    return database.transaction().execute(async (transaction) => {
      const row = await transaction
        .selectFrom("CompetitionParticipant")
        .select(["id", "status", "userId"])
        .where("competitionId", "=", competitionId)
        .where("userId", "=", user.id)
        .where("status", "in", PLACE_HOLDING_STATUSES)
        .executeTakeFirst();
      if (!row) {
        throw new HttpError(404, "You're not in this competition.");
      }
      if (row.status === "PENDING") {
        return { status: await endPendingSignup(transaction, competitionId, row) };
      }
      if (ENDED_STATUSES.has(competition.status)) {
        throw new HttpError(409, "This competition is over; you can't leave it any more.");
      }
      // Their bouts stay in the history and still shaped the ratings, so the row stays too.
      await transaction.updateTable("CompetitionParticipant").set({ status: "LEFT" }).where("id", "=", row.id).execute();
      return { status: "LEFT" };
    });
  });

  app.get("/api/v1/invites/:code", async (request): Promise<InvitePreview> => {
    const code = requirePathParam(request, "code");
    const competition = await database
      .selectFrom("Competition")
      .select("id")
      .where("inviteCode", "=", code)
      .executeTakeFirst();
    if (!competition) {
      throw new HttpError(404, "This invite link is no longer valid.");
    }
    const check = await checkJoin(database, competition.id, null, code);
    return {
      competitionId: check.competition.id,
      name: check.competition.name,
      status: check.competition.status,
      date: check.competition.date,
      joinable: check.refusal === null,
    };
  });

  app.post("/api/v1/competitions/:id/invite", async (request): Promise<NewInvite> => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);

    // One code per competition: a new one replaces (and so stops) the old link.
    const inviteCode = generateToken(12);
    await database.updateTable("Competition").set({ inviteCode }).where("id", "=", competitionId).execute();
    return { inviteCode };
  });

  app.post("/api/v1/competitions/:id/participants/:participantId/decision", async (request): Promise<SignupDecisionResult> => {
    const user = await requireAdminUser(request, database);
    const competitionId = requirePathParam(request, "id");
    const participantId = requirePathParam(request, "participantId");
    const competition = await requireCompetition(database, competitionId);
    await requireCompetitionAdmin(database, user, competitionId);
    if (ENDED_STATUSES.has(competition.status)) {
      throw new HttpError(409, "This competition is over; its sign-ups can't be decided any more.");
    }
    const accept = requireBoolean(ensureObject(request.body, "Decision").accept, "Accept");

    return database.transaction().execute(async (transaction) => {
      const row = await transaction
        .selectFrom("CompetitionParticipant")
        .select(["id", "status", "userId"])
        .where("id", "=", participantId)
        .where("competitionId", "=", competitionId)
        .executeTakeFirst();
      if (!row) {
        throw new HttpError(404, `Participant "${participantId}" not found.`);
      }
      if (row.status !== "PENDING") {
        throw new HttpError(409, "This sign-up has already been decided.");
      }
      if (accept) {
        await transaction
          .updateTable("CompetitionParticipant")
          .set({ status: "ACTIVE", joinedAt: app.now().toISOString() })
          .where("id", "=", participantId)
          .execute();
        return { participantId, status: "ACTIVE" };
      }
      // Declining ends the sign-up; the fighter may try again.
      return { participantId, status: await endPendingSignup(transaction, competitionId, row) };
    });
  });
}
