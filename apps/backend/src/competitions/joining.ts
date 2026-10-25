import { scopeAllows, type ScopeClub } from "@hema/competition-domain";
import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor, ParticipantStatus } from "../db.js";
import { HttpError } from "../http.js";
import { scopeFromRow, type CompetitionScope } from "./scope.js";

/** Why someone can't join; null from `joinRefusal` means they can. */
export type JoinRefusal = "NOT_OPEN" | "ALREADY_IN" | "OUT_OF_SCOPE" | "FULL";

/** Competitions run for a long time, so people may also join while one is running. */
const JOINABLE_STATUSES: ReadonlySet<string> = new Set(["REGISTRATION_OPEN", "RUNNING"]);

/** Fighters holding a place: the place limit counts both. */
export const PLACE_HOLDING_STATUSES: readonly ParticipantStatus[] = ["ACTIVE", "PENDING"];

export interface JoinFacts {
  competitionStatus: string;
  scope: CompetitionScope;
  placeLimit: number | null;
  /** ACTIVE + PENDING participants. */
  placesTaken: number;
  /** The fighter's own status in the competition; null when they have no row (or aren't known, as on an invite page). */
  ownStatus: ParticipantStatus | null;
  /** The fighter's club; null when they have none (then only Open competitions fit). */
  club: ScopeClub | null;
  /** A valid invite code gets the fighter past the scope check, and only past that. */
  invited: boolean;
}

/** The one joinable rule: open or running, not already in, scope fits (unless invited), and not full. */
export function joinRefusal(facts: JoinFacts): JoinRefusal | null {
  if (!JOINABLE_STATUSES.has(facts.competitionStatus)) {
    return "NOT_OPEN";
  }
  if (facts.ownStatus === "ACTIVE" || facts.ownStatus === "PENDING") {
    return "ALREADY_IN";
  }
  if (!facts.invited && !scopeAllows(facts.scope, facts.club)) {
    return "OUT_OF_SCOPE";
  }
  if (facts.placeLimit !== null && facts.placesTaken >= facts.placeLimit) {
    return "FULL";
  }
  return null;
}

export interface JoinCheck {
  refusal: JoinRefusal | null;
  competition: Selectable<BackendDatabase["Competition"]>;
  /** The fighter's existing row (a LEFT one is reused when they join again). */
  participant: { id: string; status: ParticipantStatus } | null;
  /** Whether the given invite code is the competition's current one. */
  invited: boolean;
}

/**
 * Loads what `joinRefusal` needs for one fighter (null: someone not signed in, as on an invite page) and applies it.
 * Run it inside the transaction that writes the sign-up, so the place count can't change in between.
 */
export async function checkJoin(
  executor: DbExecutor,
  competitionId: string,
  userId: string | null,
  inviteCode?: string,
): Promise<JoinCheck> {
  const competition = await executor.selectFrom("Competition").selectAll().where("id", "=", competitionId).executeTakeFirst();
  if (!competition) {
    throw new HttpError(404, `Competition "${competitionId}" not found.`);
  }

  const taken = await executor
    .selectFrom("CompetitionParticipant")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("competitionId", "=", competitionId)
    .where("status", "in", PLACE_HOLDING_STATUSES)
    .executeTakeFirstOrThrow();

  let participant: JoinCheck["participant"] = null;
  let club: ScopeClub | null = null;
  if (userId !== null) {
    const rows = await executor
      .selectFrom("CompetitionParticipant")
      .select(["id", "status"])
      .where("competitionId", "=", competitionId)
      .where("userId", "=", userId)
      .execute();
    participant = rows.find((row) => PLACE_HOLDING_STATUSES.includes(row.status)) ?? rows[0] ?? null;
    club =
      (await executor
        .selectFrom("User")
        .innerJoin("Club", "Club.id", "User.clubId")
        .select(["Club.id as id", "Club.slug as slug", "Club.area as area", "Club.countryCode as countryCode"])
        .where("User.id", "=", userId)
        .executeTakeFirst()) ?? null;
  }

  const invited = inviteCode !== undefined && competition.inviteCode !== null && inviteCode === competition.inviteCode;
  const refusal = joinRefusal({
    competitionStatus: competition.status,
    scope: scopeFromRow(competition),
    placeLimit: competition.placeLimit,
    placesTaken: Number(taken.count),
    ownStatus: participant?.status ?? null,
    club,
    invited,
  });
  return { refusal, competition, participant, invited };
}

const REFUSALS: Record<JoinRefusal, { statusCode: number; message: string }> = {
  NOT_OPEN: { statusCode: 409, message: "This competition isn't open for sign-ups." },
  ALREADY_IN: { statusCode: 409, message: "You're already in this competition." },
  OUT_OF_SCOPE: { statusCode: 403, message: "This competition is for other clubs or regions; ask its organiser for an invite link." },
  FULL: { statusCode: 409, message: "This competition is full." },
};

/** The HTTP error for a refusal; `details.reason` carries the code so apps can show their own text. */
export function joinRefusalError(refusal: JoinRefusal): HttpError {
  const { statusCode, message } = REFUSALS[refusal];
  return new HttpError(statusCode, message, { reason: refusal });
}
