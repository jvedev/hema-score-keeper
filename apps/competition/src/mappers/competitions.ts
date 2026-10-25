import type { JoinCardView, LifecycleStatusView } from "@hema/ui";
import type { Club, CompetitionDetail, CompetitionParticipant, CompetitionScope, JoinableCompetition, MyCompetition, ParticipantStatus } from "../api-types";
import type { Translate } from "./translate";

/** Who may join, in words: "Open", the club names, or "Area: Utrecht". */
export function scopeLabel(scope: CompetitionScope, clubs: readonly Club[], translate: Translate): string {
  if (scope.kind === "OPEN" || scope.values.length === 0) {
    return translate(`scope.${scope.kind}`);
  }
  if (scope.kind === "CLUB" || scope.kind === "CLUBS") {
    return scope.values.map((value) => clubs.find((club) => club.id === value || club.slug === value)?.name ?? value).join(", ");
  }
  return `${translate(`scope.${scope.kind}`)}: ${scope.values.join(", ")}`;
}

/** The Competitions screen: one card per competition the server says the fighter can join. */
export function toJoinableCards(
  joinable: readonly JoinableCompetition[],
  mine: readonly MyCompetition[],
  clubs: readonly Club[],
  translate: Translate,
): JoinCardView[] {
  return joinable.map((competition) => ({
    id: competition.id,
    name: competition.name,
    status: competition.status as LifecycleStatusView,
    scopeLabel: scopeLabel(competition.scope, clubs, translate),
    placesLeft: numberOrNull(competition.placesLeft),
    signupsNeedApproval: competition.signupsNeedApproval,
    // Someone who left can come back; anyone already in isn't listed as joinable.
    myStatus: mine.some((entry) => entry.id === competition.id && entry.myStatus === "LEFT") ? "LEFT" : null,
    joinable: true,
  }));
}

const STATUS_ORDER: readonly ParticipantStatus[] = ["ACTIVE", "PENDING", "LEFT"];

/** The fighter's status in a competition: a current row (active, pending) wins over an old one they left. */
export function myStatusIn(participants: readonly CompetitionParticipant[], userId: string): ParticipantStatus | null {
  const own = participants.filter((participant) => participant.userId === userId).map((participant) => participant.status);
  return STATUS_ORDER.find((status) => own.includes(status)) ?? null;
}

/** The join card at the top of a competition: Leave or Withdraw when in, Join only when the server lists it as joinable. */
export function toCompetitionJoinCard(input: {
  competition: CompetitionDetail;
  participants: readonly CompetitionParticipant[];
  userId: string;
  joinable: JoinableCompetition | undefined;
  clubs: readonly Club[];
  translate: Translate;
}): JoinCardView {
  const { competition, participants, joinable } = input;
  const limit = numberOrNull(competition.placeLimit);
  const taken = participants.filter((participant) => participant.status === "ACTIVE" || participant.status === "PENDING").length;
  return {
    id: competition.id,
    name: competition.name,
    status: competition.status as LifecycleStatusView,
    scopeLabel: scopeLabel(competition.scope, input.clubs, input.translate),
    placesLeft: joinable ? numberOrNull(joinable.placesLeft) : limit === null ? null : Math.max(0, limit - taken),
    signupsNeedApproval: competition.signupsNeedApproval,
    myStatus: myStatusIn(participants, input.userId),
    joinable: joinable !== undefined,
  };
}

/** The question before leaving (or withdrawing a sign-up that still waits for the organiser). */
export function leaveQuestion(myStatus: ParticipantStatus | null, name: string, translate: Translate): { message: string; confirmLabel: string } {
  return myStatus === "PENDING"
    ? { message: translate("app.withdrawConfirm", { name }), confirmLabel: translate("join.withdraw") }
    : { message: translate("app.leaveConfirm", { name }), confirmLabel: translate("join.leave") };
}

/** What happened, by the status the fighter had before. */
export function leftMessage(before: ParticipantStatus | null, name: string, translate: Translate): string {
  return translate(before === "PENDING" ? "app.signupWithdrawn" : "app.leftCompetition", { name });
}

function numberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value);
}
