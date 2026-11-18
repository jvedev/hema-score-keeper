import { ApiError, ApiSession, type AuthResponse, type AuthUser, type Session, SessionExpiredError } from "@hema/api-session";

export { ApiError };

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

export interface ApiUser {
  id: string;
  username: string;
  judgeVolunteer: boolean;
  juryVolunteer: boolean;
  tableVolunteer: boolean;
  otherVolunteer: boolean;
  skills?: ApiSkill[];
}

export interface EventAdminSessionUser {
  id: string;
  name: string;
  language: "en" | "nl";
  role: "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
}

export type EventAdminSession = Session<EventAdminSessionUser>;

const SESSION_KEY = "hema-event-admin.session";
const sessionsByBaseUrl = new Map<string, ApiSession<EventAdminSessionUser>>();
const fallbackStorage = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return fallbackStorage.size; },
  clear: () => fallbackStorage.clear(),
  getItem: (key) => fallbackStorage.get(key) ?? null,
  key: (index) => [...fallbackStorage.keys()][index] ?? null,
  removeItem: (key) => fallbackStorage.delete(key),
  setItem: (key, value) => fallbackStorage.set(key, String(value)),
};

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
  scheduledMatch: ApiScheduledMatch | null;
}

export interface ApiScheduledMatch {
  scheduledPhaseId: string;
  order: number;
}

export interface ApiMatchExchangeInput {
  scoreA: number;
  scoreB: number;
  details: unknown;
}

export interface ApiMatchCompletionInput {
  winnerEntryId?: string | null;
  scoreA: number;
  scoreB: number;
  exchanges: readonly ApiMatchExchangeInput[];
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

export interface ApiEventAdmin {
  userId: string;
  addedByUserId: string | null;
  createdAt: string;
  user: { id: string; name: string; username: string };
}

export interface ApiEventAdminCandidate {
  id: string;
  name: string;
  username: string;
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

export interface ApiTournamentAdmin {
  userId: string;
  addedByUserId: string | null;
  createdAt: string;
  user: { id: string; name: string; username: string };
}

export interface ApiTournamentAdminCandidate {
  id: string;
  name: string;
  username: string;
}

export interface ApiDatabaseLiveStatus {
  active: boolean;
  liveTournamentId: string | null;
  rings: number;
  bouts: number;
}

export interface ApiDatabaseLiveExchange {
  clientExchangeId: string;
  kind: "EXCHANGE" | "DEDUCTION";
  leftPoints: number;
  rightPoints: number;
  isDouble: boolean;
  firstScorer: "LEFT" | "RIGHT" | null;
  round: number;
}

export interface ApiDatabaseLiveResult {
  boutId: string;
  sourceMatchId: string;
  label: string;
  fighterLeft: string;
  fighterRight: string;
  score: { left: number; right: number; doubles: number };
  exchanges: ApiDatabaseLiveExchange[];
}

export interface ApiDatabaseLiveCorrectionInput {
  exchanges: readonly Omit<ApiDatabaseLiveExchange, "isDouble">[];
}

/** Who holds a live ring's keeper link right now (never the device id). */
export interface ApiLiveRingKeeper {
  userName: string;
  /** ISO timestamp of the claim. */
  since: string;
}

/** A live ring as its tournament admins see it, with the secret keeper and scoreboard tokens. */
export interface ApiLiveRing {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
  leftColor: string;
  rightColor: string;
  scoreboard: ApiScoreboardSettings;
  keeperToken: string;
  scoreboardToken: string;
  activeKeeper: ApiLiveRingKeeper | null;
}

export type ApiScoreboardTextSize = "SMALL" | "MEDIUM" | "LARGE";
export type ApiScoreboardTheme = "DARK" | "LIGHT";

/** How a ring's scoreboard looks; set at the table or by tournament admins. */
export interface ApiScoreboardSettings {
  /** Left and right swapped on the scoreboard only (the colours stay with their fighter). */
  mirrored: boolean;
  showNext: boolean;
  textSize: ApiScoreboardTextSize;
  theme: ApiScoreboardTheme;
}

/** Colours a ring shows for the left and right fighter, as `#rrggbb` from the event palette. */
export interface ApiLiveRingColors {
  leftColor: string;
  rightColor: string;
}

export type ApiRingOvertimeAfter = "EVERY_ROUND" | "LAST_ROUND";

/** Mirrors `BoutFormat` in `@hema/competition-domain`. */
export interface ApiRingBoutFormat {
  rounds: number;
  breakSeconds: number;
  lastExchangeSeconds: number;
  overtimeAfter: ApiRingOvertimeAfter;
  extensions: number;
  extensionSeconds: number;
  suddenDeath: boolean;
}

export interface ApiRingPenalty {
  description: string;
  penalties: number[];
  disqualify: boolean;
}

/** Mirrors `RingRules` in `@hema/competition-domain`: what the tables of a live tournament score with. */
export interface ApiRingRules {
  maxDurationSeconds: number;
  scores: number[];
  maxDoubles: number;
  maxPointsCap: number;
  penalties: ApiRingPenalty[];
  format: ApiRingBoutFormat;
}

/** A built-in palette colour; its name is translated until an admin renames it. */
export type ApiEventColorPreset = "RED" | "BLUE";

/** One colour of an Event's fighter palette; arena and ring colours pick from it. */
export interface ApiEventColor {
  id: string;
  eventId: string;
  /** Null: show the preset's translated name. */
  name: string | null;
  preset: ApiEventColorPreset | null;
  /** `#rrggbb`, lower case. */
  hex: string;
  order: number;
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
  /** The event's fighter colour palette, in order (at least two). */
  colors: ApiEventColor[];
}

export interface ApiEventMutationResult {
  id: string;
  eventName: string;
  ruleset: ApiRuleset | null;
  allFightersAreVolunteers: boolean;
}

export interface ApiEventCompetition {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  visibility: string;
  clubId: string | null;
  eventId: string | null;
}

export interface ApiRulesetDetail extends ApiRuleset {
  matchCount: number;
  locked: boolean;
}

export interface ApiClient {
  currentSession(): EventAdminSession | null;
  login(username: string, password: string): Promise<EventAdminSession>;
  logout(): Promise<void>;
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
  listEventCompetitions(eventId: string): Promise<ApiEventCompetition[]>;
  createEventCompetition(
    eventId: string,
    body: {
      name: string;
      slug: string;
      date: string;
      visibility?: string;
      clubId?: string | null;
      rulesetJson?: unknown;
    },
  ): Promise<ApiEventCompetition>;
  setCompetitionEvent(competitionId: string, eventId: string | null): Promise<ApiEventCompetition>;
  eventAdmins(id: string): Promise<ApiEventAdmin[]>;
  eventAdminCandidates(id: string): Promise<ApiEventAdminCandidate[]>;
  addEventAdmin(id: string, userId: string): Promise<ApiEventAdmin[]>;
  removeEventAdmin(id: string, userId: string): Promise<void>;
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
  scheduleMatch(
    id: string,
    body: { scheduledPhaseId: string; order: number },
  ): Promise<ApiMatch>;
  unscheduleMatch(id: string): Promise<void>;
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
  tournamentAdmins(id: string): Promise<ApiTournamentAdmin[]>;
  tournamentAdminCandidates(id: string): Promise<ApiTournamentAdminCandidate[]>;
  addTournamentAdmin(id: string, userId: string): Promise<ApiTournamentAdmin[]>;
  removeTournamentAdmin(id: string, userId: string): Promise<void>;
  databaseLiveStatus(id: string): Promise<ApiDatabaseLiveStatus>;
  databaseLiveResults(id: string): Promise<ApiDatabaseLiveResult[]>;
  activateDatabaseLive(id: string): Promise<{ id: string; projection: { rings: number; bouts: number; removedBouts: number } }>;
  projectDatabaseLive(id: string): Promise<{ rings: number; bouts: number; removedBouts: number }>;
  correctDatabaseLiveResult(id: string, body: ApiDatabaseLiveCorrectionInput): Promise<{ revision: number }>;
  /** The rings of a live tournament with their keeper and scoreboard tokens (tournament admins only). */
  liveRings(liveTournamentId: string): Promise<ApiLiveRing[]>;
  /** The ring rules of a live tournament (the stored rules, or the defaults). */
  liveRingRules(liveTournamentId: string): Promise<ApiRingRules>;
  saveLiveRingRules(liveTournamentId: string, rules: ApiRingRules): Promise<ApiRingRules>;
  /** A new keeper link: the old one stops working and whoever keeps the ring is stopped. */
  rotateLiveRingKeeperToken(ringId: string): Promise<void>;
  /** A new scoreboard link: screens showing the old one stop updating. */
  rotateLiveRingScoreboardToken(ringId: string): Promise<void>;
  setLiveRingColors(ringId: string, colors: ApiLiveRingColors): Promise<ApiLiveRingColors>;
  setLiveRingScoreboardSettings(ringId: string, settings: ApiScoreboardSettings): Promise<ApiScoreboardSettings>;
  /** Event palette (event admins): each call answers the whole palette, in order. */
  addEventColor(eventId: string, body: { name: string; hex: string }): Promise<ApiEventColor[]>;
  updateEventColor(colorId: string, body: { name?: string; hex?: string }): Promise<ApiEventColor[]>;
  /** Refused (409) for the last two colours or a colour an arena or ring uses. */
  deleteEventColor(colorId: string): Promise<ApiEventColor[]>;
  /** Every colour of the event once, in the new order. */
  reorderEventColors(eventId: string, colorIds: string[]): Promise<ApiEventColor[]>;
  createArena(body: { eventId: string; name: string; order?: number; leftColor?: string; rightColor?: string }): Promise<ApiArena>;
  updateArena(
    id: string,
    body: { eventId?: string; name?: string; order?: number; leftColor?: string; rightColor?: string },
  ): Promise<ApiArena>;
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
  completeMatch(id: string, body: ApiMatchCompletionInput): Promise<ApiMatch>;
}

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export function createApiClient(baseUrl = defaultBaseUrl): ApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  let session = sessionsByBaseUrl.get(normalizedBaseUrl);
  if (!session) {
    session = new ApiSession<EventAdminSessionUser>({
      baseUrl: normalizedBaseUrl,
      storage: typeof localStorage === "undefined" ? memoryStorage : localStorage,
      storageKey: SESSION_KEY,
      toUser: (user: AuthUser) => ({
        id: user.id,
        name: user.name,
        language: user.language === "nl" ? "nl" : "en",
        role: user.role === "SYSTEM_ADMIN" || user.role === "COMPETITION_ADMIN" ? user.role : "USER",
      }),
    });
    sessionsByBaseUrl.set(normalizedBaseUrl, session);
  }
  const apiSession = session;
  return {
    currentSession: () => apiSession.current(),
    login: async (username, password) =>
      apiSession.store(await apiSession.send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false)),
    logout: () => apiSession.logout(),
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
    listEventCompetitions: (eventId) =>
      requestJson<ApiEventCompetition[]>(baseUrl, `/events/${eventId}/competitions`),
    createEventCompetition: (eventId, body) =>
      requestJson<ApiEventCompetition>(baseUrl, `/events/${eventId}/competitions`, {
        method: "POST",
        body,
      }),
    setCompetitionEvent: (competitionId, eventId) =>
      requestJson<ApiEventCompetition>(baseUrl, `/competitions/${competitionId}/event`, {
        method: "PATCH",
        body: { eventId },
      }),
    eventAdmins: async (id) =>
      (await requestJson<{ admins: ApiEventAdmin[] }>(baseUrl, `/events/${id}/admins`)).admins,
    eventAdminCandidates: async (id) =>
      (await requestJson<{ candidates: ApiEventAdminCandidate[] }>(baseUrl, `/events/${id}/admin-candidates`)).candidates,
    addEventAdmin: async (id, userId) =>
      (await requestJson<{ admins: ApiEventAdmin[] }>(baseUrl, `/events/${id}/admins`, {
        method: "POST",
        body: { userId },
      })).admins,
    removeEventAdmin: (id, userId) =>
      requestJson<void>(baseUrl, `/events/${id}/admins/${userId}`, { method: "DELETE" }),
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
    scheduleMatch: (id, body) =>
      requestJson<ApiMatch>(baseUrl, `/matches/${id}/schedule`, { method: "PUT", body }),
    unscheduleMatch: (id) =>
      requestJson<void>(baseUrl, `/matches/${id}/schedule`, { method: "DELETE" }),
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
    tournamentAdmins: async (id) =>
      (await requestJson<{ admins: ApiTournamentAdmin[] }>(baseUrl, `/tournaments/${id}/admins`)).admins,
    tournamentAdminCandidates: async (id) =>
      (await requestJson<{ candidates: ApiTournamentAdminCandidate[] }>(baseUrl, `/tournaments/${id}/admin-candidates`)).candidates,
    addTournamentAdmin: async (id, userId) =>
      (await requestJson<{ admins: ApiTournamentAdmin[] }>(baseUrl, `/tournaments/${id}/admins`, {
        method: "POST",
        body: { userId },
      })).admins,
    removeTournamentAdmin: (id, userId) =>
      requestJson<void>(baseUrl, `/tournaments/${id}/admins/${encodeURIComponent(userId)}`, { method: "DELETE" }),
    databaseLiveStatus: (id) => requestJson<ApiDatabaseLiveStatus>(baseUrl, `/tournaments/${id}/live`),
    databaseLiveResults: async (id) =>
      (await requestJson<{ results: ApiDatabaseLiveResult[] }>(baseUrl, `/tournaments/${id}/live/results`)).results,
    activateDatabaseLive: (id) =>
      requestJson<{ id: string; projection: { rings: number; bouts: number; removedBouts: number } }>(
        baseUrl,
        `/tournaments/${id}/live`,
        { method: "POST" },
      ),
    projectDatabaseLive: async (id) => {
      const result = await requestJson<{ rings: number; bouts: number; removedBouts: number }>(
        baseUrl,
        `/live-tournaments/${id}/project`,
        { method: "POST" },
      );
      return result;
    },
    correctDatabaseLiveResult: (id, body) =>
      requestJson<{ revision: number }>(baseUrl, `/live-bouts/${id}/correction`, { method: "POST", body }),
    liveRings: async (liveTournamentId) =>
      (await requestJson<{ rings: ApiLiveRing[] }>(baseUrl, `/live-tournaments/${encodeURIComponent(liveTournamentId)}/rings`)).rings,
    liveRingRules: async (liveTournamentId) =>
      (await requestJson<{ rules: ApiRingRules }>(baseUrl, `/live-tournaments/${encodeURIComponent(liveTournamentId)}`)).rules,
    saveLiveRingRules: async (liveTournamentId, rules) =>
      (await requestJson<{ rules: ApiRingRules }>(baseUrl, `/live-tournaments/${encodeURIComponent(liveTournamentId)}/rules`, {
        method: "PUT",
        body: rules,
      })).rules,
    rotateLiveRingKeeperToken: async (ringId) => {
      await requestJson<unknown>(baseUrl, `/live-rings/${encodeURIComponent(ringId)}/rotate-token`, { method: "POST" });
    },
    rotateLiveRingScoreboardToken: async (ringId) => {
      await requestJson<unknown>(baseUrl, `/live-rings/${encodeURIComponent(ringId)}/rotate-scoreboard-token`, { method: "POST" });
    },
    setLiveRingColors: async (ringId, colors) => {
      const { ring } = await requestJson<{ ring: ApiLiveRingColors }>(baseUrl, `/live-rings/${encodeURIComponent(ringId)}/colors`, {
        method: "PUT",
        body: colors,
      });
      return { leftColor: ring.leftColor, rightColor: ring.rightColor };
    },
    setLiveRingScoreboardSettings: async (ringId, settings) =>
      (await requestJson<{ ring: { scoreboard: ApiScoreboardSettings } }>(baseUrl, `/live-rings/${encodeURIComponent(ringId)}/scoreboard-settings`, {
        method: "PUT",
        body: settings,
      })).ring.scoreboard,
    addEventColor: async (eventId, body) =>
      (await requestJson<{ colors: ApiEventColor[] }>(baseUrl, `/events/${encodeURIComponent(eventId)}/colors`, { method: "POST", body })).colors,
    updateEventColor: async (colorId, body) =>
      (await requestJson<{ colors: ApiEventColor[] }>(baseUrl, `/event-colors/${encodeURIComponent(colorId)}`, { method: "PATCH", body })).colors,
    deleteEventColor: async (colorId) =>
      (await requestJson<{ colors: ApiEventColor[] }>(baseUrl, `/event-colors/${encodeURIComponent(colorId)}`, { method: "DELETE" })).colors,
    reorderEventColors: async (eventId, colorIds) =>
      (await requestJson<{ colors: ApiEventColor[] }>(baseUrl, `/events/${encodeURIComponent(eventId)}/colors/order`, { method: "PUT", body: { colorIds } })).colors,
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
    completeMatch: (id, body) =>
      requestJson<ApiMatch>(baseUrl, `/matches/${id}/complete`, {
        method: "POST",
        body,
      }),
  };
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const session = sessionsByBaseUrl.get(baseUrl.replace(/\/$/, ""));
  if (session) {
    try {
      return await session.send<T>(options?.method ?? "GET", path, options?.body);
    } catch (error) {
      if (error instanceof SessionExpiredError && typeof window !== "undefined") {
        window.dispatchEvent(new Event("event-admin-session-expired"));
      }
      throw error;
    }
  }

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
    throw await readError(response);
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

/** The refusal as an `ApiError`, keeping the JSON body so callers can act on extra fields such as `reason`. */
async function readError(response: Response): Promise<ApiError> {
  const fallback = `Request failed with status ${response.status}.`;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed: unknown = await response.json().catch(() => undefined);
    const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    const message = typeof body.error === "string" && body.error ? body.error : fallback;
    return new ApiError(message, response.status, body.details, body);
  }

  const text = await response.text();
  return new ApiError(text.trim().length > 0 ? text : fallback, response.status, undefined);
}
