export type StageType = "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL";
export type EntryKind = "FIGHTER" | "VOLUNTEER" | "BOTH";
export type StageOfficialRole = "JUDGE" | "JURY" | "TELLER" | "TABLE";
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

export interface ApiUser {
  id: string;
  username: string;
  judgeVolunteer: boolean;
  juryVolunteer: boolean;
  tableVolunteer: boolean;
  otherVolunteer: boolean;
  skills?: ApiSkill[];
}

export interface ApiSkill {
  id: string;
  userId: string;
  skillName: string;
  skillLevel: number;
}

export interface ApiArena {
  id: string;
  eventId: string;
  name: string;
  order: number;
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

export interface ApiScheduledAssignment {
  id: string;
  scheduledPhaseId: string;
  userId: string;
  role: ScheduleRole;
  user: ApiUser;
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

export interface ApiClient {
  listUsers(): Promise<ApiUser[]>;
  createUser(body: { username: string }): Promise<ApiUser>;
  updateUser(
    id: string,
    body: {
      username?: string;
      judgeVolunteer?: boolean;
      juryVolunteer?: boolean;
      tableVolunteer?: boolean;
      otherVolunteer?: boolean;
    },
  ): Promise<ApiUser>;
  createSkill(body: { userId: string; skillName: string; skillLevel: number }): Promise<ApiSkill>;
  updateSkill(id: string, body: { skillName?: string; skillLevel?: number }): Promise<ApiSkill>;
  deleteSkill(id: string): Promise<void>;
  listEvents(): Promise<ApiEvent[]>;
  getEvent(id: string): Promise<ApiEvent>;
  createEvent(body: { eventName: string; rulesetId?: string | null; allFightersAreVolunteers?: boolean }): Promise<ApiEventMutationResult>;
  updateEvent(id: string, body: { eventName?: string; rulesetId?: string | null; allFightersAreVolunteers?: boolean }): Promise<ApiEventMutationResult>;
  deleteEvent(id: string): Promise<void>;
  getEventSchedule(eventId: string): Promise<ApiEventScheduleResponse>;
  updateEventSchedule(eventId: string, body: { startTimeMinutes?: number; currentTimeSlotId?: string | null }): Promise<ApiEventSchedule>;
  createScheduleTimeSlot(
    eventId: string,
    body: { durationMinutes: number; label: string; color?: string | null; isBreak?: boolean },
  ): Promise<ApiScheduleTimeSlot>;
  updateScheduleTimeSlot(
    id: string,
    body: { durationMinutes?: number; label?: string; color?: string | null; isBreak?: boolean },
  ): Promise<ApiScheduleTimeSlot>;
  deleteScheduleTimeSlot(id: string): Promise<void>;
  listRulesets(eventId: string): Promise<ApiRulesetDetail[]>;
  getRuleset(id: string): Promise<ApiRulesetDetail>;
  createRuleset(
    eventId: string,
    body: {
      name: string;
      baseRulesetId?: string;
      definition?: ApiRulesetDefinition | null;
    },
  ): Promise<ApiRulesetDetail>;
  updateRuleset(
    id: string,
    body: {
      name?: string;
      definition?: ApiRulesetDefinition | null;
    },
  ): Promise<ApiRulesetDetail>;
  createScheduledPhase(body: {
    stageId: string;
    arenaId: string;
    timeSlotId: string;
  }): Promise<ApiScheduledPhase>;
  updateScheduledPhase(
    id: string,
    body: { stageId?: string; arenaId?: string; timeSlotId?: string },
  ): Promise<ApiScheduledPhase>;
  deleteScheduledPhase(id: string): Promise<void>;
  createScheduledAssignment(
    scheduledPhaseId: string,
    body: { userId: string; role: ScheduleRole },
  ): Promise<ApiScheduledAssignment>;
  deleteScheduledAssignment(id: string): Promise<void>;
  createTournament(body: {
    eventId: string;
    name: string;
    order?: number;
    rulesetId?: string | null;
  }): Promise<ApiTournament>;
  updateTournament(
    id: string,
    body: {
      eventId?: string;
      name?: string;
      order?: number;
      rulesetId?: string | null;
      currentStageId?: string | null;
    },
  ): Promise<ApiTournament>;
  listTournaments(): Promise<ApiTournament[]>;
  getTournament(id: string): Promise<ApiTournament>;
  deleteTournament(id: string): Promise<void>;
  createArena(body: { eventId: string; name: string; order?: number }): Promise<ApiArena>;
  updateArena(id: string, body: { eventId?: string; name?: string; order?: number }): Promise<ApiArena>;
  listArenas(): Promise<ApiArena[]>;
  deleteArena(id: string): Promise<void>;
  createEntry(body: {
    tournamentId: string;
    userId: string;
    kind?: EntryKind;
    seed?: number;
  }): Promise<ApiEntry>;
  updateEntry(
    id: string,
    body: {
      tournamentId?: string;
      userId?: string;
      kind?: EntryKind;
      seed?: number | null;
    },
  ): Promise<ApiEntry>;
  listEntries(): Promise<ApiEntry[]>;
  deleteEntry(id: string): Promise<void>;
  createStage(body: {
    tournamentId: string;
    type: StageType;
    name?: string | null;
    rulesetId?: string | null;
    minPoolSize?: number | null;
    maxPoolSize?: number | null;
    preferredPoolSize?: number | null;
    eliminationParticipantCount?: number | null;
    timeBetweenMatchesMinutes?: number | null;
  }): Promise<ApiStage>;
  updateStage(
    id: string,
    body: {
      tournamentId?: string;
      type?: StageType;
      name?: string | null;
      rulesetId?: string | null;
      minPoolSize?: number | null;
      maxPoolSize?: number | null;
      preferredPoolSize?: number | null;
      eliminationParticipantCount?: number | null;
      timeBetweenMatchesMinutes?: number | null;
    },
  ): Promise<ApiStage>;
  listStages(): Promise<ApiStage[]>;
  deleteStage(id: string): Promise<void>;
  createStageArena(stageId: string, body: { arenaId: string }): Promise<ApiStageArena>;
  deleteStageArena(stageId: string, arenaId: string): Promise<void>;
  createStageOfficial(
    stageId: string,
    body: { entryId: string; role: StageOfficialRole },
  ): Promise<ApiStageOfficial>;
  deleteStageOfficial(id: string): Promise<void>;
  listRounds(): Promise<ApiRound[]>;
  listMatches(): Promise<ApiMatch[]>;
}

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export function createApiClient(baseUrl = defaultBaseUrl): ApiClient {
  return {
    listUsers: () => requestJson<ApiUser[]>(baseUrl, "/users"),
    createUser: (body) => requestJson<ApiUser>(baseUrl, "/users", { method: "POST", body }),
    updateUser: (id, body) => requestJson<ApiUser>(baseUrl, `/users/${id}`, { method: "PATCH", body }),
    createSkill: (body) => requestJson<ApiSkill>(baseUrl, "/skills", { method: "POST", body }),
    updateSkill: (id, body) => requestJson<ApiSkill>(baseUrl, `/skills/${id}`, { method: "PATCH", body }),
    deleteSkill: (id) => requestJson<void>(baseUrl, `/skills/${id}`, { method: "DELETE" }),
    listEvents: () => requestJson<ApiEvent[]>(baseUrl, "/events"),
    getEvent: (id) => requestJson<ApiEvent>(baseUrl, `/events/${id}`),
    createEvent: (body) => requestJson<ApiEventMutationResult>(baseUrl, "/events", {
      method: "POST",
      body,
    }),
    updateEvent: (id, body) => requestJson<ApiEventMutationResult>(baseUrl, `/events/${id}`, {
      method: "PATCH",
      body,
    }),
    deleteEvent: (id) => requestJson<void>(baseUrl, `/events/${id}`, { method: "DELETE" }),
    listRulesets: (eventId) => requestJson<ApiRulesetDetail[]>(baseUrl, `/events/${eventId}/rulesets`),
    getRuleset: (id) => requestJson<ApiRulesetDetail>(baseUrl, `/rulesets/${id}`),
    createRuleset: (eventId, body) =>
      requestJson<ApiRulesetDetail>(baseUrl, `/events/${eventId}/rulesets`, { method: "POST", body }),
    updateRuleset: (id, body) =>
      requestJson<ApiRulesetDetail>(baseUrl, `/rulesets/${id}`, { method: "PATCH", body }),
    getEventSchedule: (eventId) =>
      requestJson<ApiEventScheduleResponse>(baseUrl, `/events/${eventId}/schedule`),
    updateEventSchedule: (eventId, body) =>
      requestJson<ApiEventSchedule>(baseUrl, `/events/${eventId}/schedule`, {
        method: "PATCH",
        body,
      }),
    createScheduleTimeSlot: (eventId, body) =>
      requestJson<ApiScheduleTimeSlot>(baseUrl, `/events/${eventId}/schedule/slots`, {
        method: "POST",
        body,
      }),
    updateScheduleTimeSlot: (id, body) =>
      requestJson<ApiScheduleTimeSlot>(baseUrl, `/schedule-time-slots/${id}`, {
        method: "PATCH",
        body,
      }),
    deleteScheduleTimeSlot: (id) =>
      requestJson<void>(baseUrl, `/schedule-time-slots/${id}`, { method: "DELETE" }),
    createScheduledPhase: (body) =>
      requestJson<ApiScheduledPhase>(baseUrl, "/scheduled-phases", { method: "POST", body }),
    updateScheduledPhase: (id, body) =>
      requestJson<ApiScheduledPhase>(baseUrl, `/scheduled-phases/${id}`, {
        method: "PATCH",
        body,
      }),
    deleteScheduledPhase: (id) =>
      requestJson<void>(baseUrl, `/scheduled-phases/${id}`, { method: "DELETE" }),
    createScheduledAssignment: (scheduledPhaseId, body) =>
      requestJson<ApiScheduledAssignment>(baseUrl, `/scheduled-phases/${scheduledPhaseId}/assignments`, {
        method: "POST",
        body,
      }),
    deleteScheduledAssignment: (id) =>
      requestJson<void>(baseUrl, `/scheduled-assignments/${id}`, { method: "DELETE" }),
    createTournament: (body) => requestJson<ApiTournament>(baseUrl, "/tournaments", { method: "POST", body }),
    updateTournament: (id, body) =>
      requestJson<ApiTournament>(baseUrl, `/tournaments/${id}`, { method: "PATCH", body }),
    listTournaments: () => requestJson<ApiTournament[]>(baseUrl, "/tournaments"),
    getTournament: (id) => requestJson<ApiTournament>(baseUrl, `/tournaments/${id}`),
    deleteTournament: (id) => requestJson<void>(baseUrl, `/tournaments/${id}`, { method: "DELETE" }),
    createArena: (body) => requestJson<ApiArena>(baseUrl, "/arenas", { method: "POST", body }),
    updateArena: (id, body) => requestJson<ApiArena>(baseUrl, `/arenas/${id}`, { method: "PATCH", body }),
    listArenas: () => requestJson<ApiArena[]>(baseUrl, "/arenas"),
    deleteArena: (id) => requestJson<void>(baseUrl, `/arenas/${id}`, { method: "DELETE" }),
    createEntry: (body) => requestJson<ApiEntry>(baseUrl, "/entries", { method: "POST", body }),
    updateEntry: (id, body) => requestJson<ApiEntry>(baseUrl, `/entries/${id}`, { method: "PATCH", body }),
    listEntries: () => requestJson<ApiEntry[]>(baseUrl, "/entries"),
    deleteEntry: (id) => requestJson<void>(baseUrl, `/entries/${id}`, { method: "DELETE" }),
    createStage: (body) => requestJson<ApiStage>(baseUrl, "/stages", { method: "POST", body }),
    updateStage: (id, body) => requestJson<ApiStage>(baseUrl, `/stages/${id}`, { method: "PATCH", body }),
    listStages: () => requestJson<ApiStage[]>(baseUrl, "/stages"),
    deleteStage: (id) => requestJson<void>(baseUrl, `/stages/${id}`, { method: "DELETE" }),
    createStageArena: (stageId, body) =>
      requestJson<ApiStageArena>(baseUrl, `/stages/${stageId}/arenas`, { method: "POST", body }),
    deleteStageArena: (stageId, arenaId) =>
      requestJson<void>(baseUrl, `/stages/${stageId}/arenas/${arenaId}`, { method: "DELETE" }),
    createStageOfficial: (stageId, body) =>
      requestJson<ApiStageOfficial>(baseUrl, `/stages/${stageId}/officials`, { method: "POST", body }),
    deleteStageOfficial: (id) => requestJson<void>(baseUrl, `/stage-officials/${id}`, { method: "DELETE" }),
    listRounds: () => requestJson<ApiRound[]>(baseUrl, "/rounds"),
    listMatches: () => requestJson<ApiMatch[]>(baseUrl, "/matches"),
  };
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const requestInit: RequestInit = {
    method: options?.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  };

  if (options?.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(baseUrl, path), requestInit);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}.`;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: string } | undefined;
    return body?.error ? body.error : fallback;
  }

  const text = await response.text();
  return text.trim().length > 0 ? text : fallback;
}
