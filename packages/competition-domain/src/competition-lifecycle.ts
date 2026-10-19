export type CompetitionStatus = "DRAFT" | "REGISTRATION_OPEN" | "RUNNING" | "CLOSED" | "ARCHIVED";
export type CompetitionAction = "OPEN_REGISTRATION" | "START" | "CLOSE" | "REOPEN" | "ARCHIVE";

export interface ReadinessInput {
  rulesetVersionId: string | null;
  hasScope: boolean;
  startDate: string | null;
}

export interface ReadinessChecklist {
  rulesetChosen: boolean;
  scopeAndDatesSet: boolean;
  ready: boolean;
}

export type CompetitionTransitionErrorCode = "NOT_ALLOWED" | "NOT_READY";

export class CompetitionTransitionError extends Error {
  constructor(
    readonly code: CompetitionTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CompetitionTransitionError";
  }
}

const TRANSITIONS: Record<CompetitionStatus, Partial<Record<CompetitionAction, CompetitionStatus>>> = {
  DRAFT: { OPEN_REGISTRATION: "REGISTRATION_OPEN" },
  REGISTRATION_OPEN: { START: "RUNNING" },
  RUNNING: { CLOSE: "CLOSED" },
  CLOSED: { REOPEN: "RUNNING", ARCHIVE: "ARCHIVED" },
  ARCHIVED: {},
};

export function readinessChecklist(input: ReadinessInput): ReadinessChecklist {
  const rulesetChosen = input.rulesetVersionId !== null;
  const scopeAndDatesSet = input.hasScope && input.startDate !== null;
  return { rulesetChosen, scopeAndDatesSet, ready: rulesetChosen && scopeAndDatesSet };
}

export function transitionCompetition(
  status: CompetitionStatus,
  action: CompetitionAction,
  readiness: ReadinessChecklist,
): CompetitionStatus {
  const next = TRANSITIONS[status][action];
  if (next === undefined) {
    throw new CompetitionTransitionError("NOT_ALLOWED", `Cannot ${action} a competition that is ${status}.`);
  }
  if (action === "OPEN_REGISTRATION" && !readiness.ready) {
    throw new CompetitionTransitionError("NOT_READY", "The competition isn't ready to open registration.");
  }
  return next;
}
