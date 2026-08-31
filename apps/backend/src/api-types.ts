export type StageType = "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL";
export type EntryKind = "FIGHTER" | "VOLUNTEER" | "BOTH";
export type StageOfficialRole = "JUDGE" | "JURY" | "TABLE";
export type ScheduleRole = "JUDGE" | "JURY" | "TABLE" | "FIGHTER";

export interface ApiPenaltyRule {
  description: string;
  penalties: number[];
  disqualify: boolean;
}

export interface ApiMatchParameters {
  maxDurationSeconds: number;
  stopOnTimeOut: boolean;
  maxPointsCap: number;
  pointSpreadVictory: number;
  scores: number[];
  maxDoubles: number;
  allowAfterBlow: boolean;
  countDoubles: boolean;
  useNetScore: boolean;
  penalties: ApiPenaltyRule[];
}

export interface ApiRulesetDefinition {
  weaponClass: string;
  matchParameters: ApiMatchParameters;
}

export interface ApiRuleset {
  id: string;
  eventId: string;
  name: string;
  version: number;
  definition: ApiRulesetDefinition | null;
}

export interface ApiSkill {
  id: string;
  userId: string;
  skillName: string;
  skillLevel: number;
}

export interface ApiUser {
  id: string;
  username: string;
  judgeVolunteer: boolean;
  juryVolunteer: boolean;
  tableVolunteer: boolean;
  otherVolunteer: boolean;
  skills?: ApiSkill[];
}

export interface ApiArena {
  id: string;
  eventId: string;
  name: string;
  order: number;
  leftColor?: string;
  rightColor?: string;
}

export interface ApiEntry {
  id: string;
  tournamentId: string;
  userId: string;
  kind: EntryKind;
  seed: number | null;
  user: ApiUser;
}

export interface ApiStageOfficial {
  id: string;
  stageId: string;
  entryId: string;
  role: StageOfficialRole;
}

export interface ApiStageArena {
  id: string;
  stageId: string;
  arenaId: string;
  arena: ApiArena;
}

export interface ApiMatch {
  id: string;
  roundId: string;
  arenaId: string | null;
  entryAId: string | null;
  entryBId: string | null;
  winnerEntryId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  ruleset: ApiRuleset | null;
}

export interface ApiRound {
  id: string;
  stageId: string;
  roundNumber: number;
  matches: ApiMatch[];
}

export interface ApiStage {
  id: string;
  tournamentId: string;
  type: StageType;
  name: string | null;
  ruleset: ApiRuleset | null;
  minPoolSize: number | null;
  maxPoolSize: number | null;
  preferredPoolSize: number | null;
  eliminationParticipantCount: number | null;
  timeBetweenMatchesMinutes: number;
  rounds: ApiRound[];
  arenas: ApiStageArena[];
  officials: ApiStageOfficial[];
}

export interface ApiTournament {
  id: string;
  eventId: string;
  name: string;
  ruleset: ApiRuleset | null;
  currentStageId?: string | null;
  order: number;
  color: string;
  entries: ApiEntry[];
  stages: ApiStage[];
}

export interface ApiScheduledAssignment {
  id: string;
  scheduledPhaseId: string;
  userId: string;
  role: ScheduleRole;
  user: ApiUser;
}

export interface ApiScheduledPhase {
  id: string;
  stageId: string;
  arenaId: string;
  timeSlotId: string;
  stage: ApiStage & {
    tournament: Pick<ApiTournament, "id" | "eventId" | "name" | "color">;
  };
  arena: ApiArena;
  assignments: ApiScheduledAssignment[];
}

export interface ApiScheduleTimeSlot {
  id: string;
  scheduleId: string;
  order: number;
  durationMinutes: number;
  label: string;
  color: string | null;
  isBreak: boolean;
  scheduledPhases: ApiScheduledPhase[];
}

export interface ApiEventSchedule {
  id: string;
  eventId: string;
  startTimeMinutes: number;
  currentTimeSlotId: string | null;
  timeSlots: ApiScheduleTimeSlot[];
}

export interface ApiEventScheduleResponse {
  event: ApiEvent;
  schedule: ApiEventSchedule;
}

export interface ApiEvent {
  id: string;
  eventName: string;
  ruleset: ApiRuleset | null;
  allFightersAreVolunteers: boolean;
  schedule?: ApiEventSchedule | null;
  tournaments: ApiTournament[];
  arenas: ApiArena[];
  rulesets: ApiRuleset[];
}

export interface ApiEventMutationResult {
  id: string;
  eventName: string;
  ruleset: ApiRuleset | null;
  allFightersAreVolunteers: boolean;
}

export interface ApiRulesetDetail extends ApiRuleset {
  matchCount: number;
  locked: boolean;
}
