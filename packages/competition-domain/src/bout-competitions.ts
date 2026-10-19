import type { CompetitionStatus } from "./competition-lifecycle.js";

export interface CompetitionEnrolment {
  competitionId: string;
  status: CompetitionStatus;
  enrolledUserIds: ReadonlySet<string>;
}

export class SameFighterError extends Error {
  constructor() {
    super("A bout needs two different fighters.");
    this.name = "SameFighterError";
  }
}

/** A bout counts in every running competition both fighters are enrolled in; scope plays no part. */
export function competitionsForBout(
  userAId: string,
  userBId: string,
  competitions: readonly CompetitionEnrolment[],
): string[] {
  if (userAId === userBId) {
    throw new SameFighterError();
  }
  return competitions
    .filter(
      (competition) =>
        competition.status === "RUNNING" &&
        competition.enrolledUserIds.has(userAId) &&
        competition.enrolledUserIds.has(userBId),
    )
    .map((competition) => competition.competitionId);
}
