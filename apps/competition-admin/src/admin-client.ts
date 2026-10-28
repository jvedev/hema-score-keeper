import type { RingRules } from "@hema/competition-domain";
import type {
  AdminUser,
  BoutResponse,
  Club,
  CompetitionAdminEntry,
  AdminCompetitionDetail,
  CompetitionDetail,
  CompetitionSummary,
  HistoryBout,
  ImportReport,
  LiveRingLink,
  LiveTournamentDetail,
  LiveTournamentSummary,
  NeedsYouResponse,
  NewInvite,
  ObjectionResolution,
  ParticipantRow,
  PersonSearchResult,
  SignupDecisionResult,
  StandingRow,
  SyncTarget,
} from "./api-types";
import { ApiSession, type AuthResponse, type Session as ApiSessionState } from "@hema/api-session";

export { ApiError, SessionExpiredError } from "@hema/api-session";

export type Session = ApiSessionState<AdminUser>;

const SESSION_KEY = "hema-competition-admin.session";

const e = encodeURIComponent;

export class AdminClient {
  /** Tokens and the shared refresh (refresh tokens are single use), shared with the participant app. */
  readonly #api: ApiSession<AdminUser>;

  constructor(baseUrl: string, storage: Storage = localStorage) {
    this.#api = new ApiSession<AdminUser>({
      baseUrl,
      storage,
      storageKey: SESSION_KEY,
      toUser: (user) => ({ id: user.id, name: user.name, language: user.language === "nl" ? "nl" : "en", role: user.role as AdminUser["role"] }),
    });
  }

  currentSession(): Session | null {
    return this.#api.current();
  }

  async login(username: string, password: string): Promise<Session> {
    return this.#api.store(await this.#send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false));
  }

  logout(): Promise<void> {
    return this.#api.logout();
  }

  async setLanguage(language: "en" | "nl"): Promise<void> {
    await this.#send("PATCH", "/auth/me", { language });
    this.#api.update({ language });
  }

  needsYou = () => this.#send<NeedsYouResponse>("GET", "/admin/needs-you");
  competitions = () => this.#send<CompetitionSummary[]>("GET", "/competitions/admin");
  competition = (id: string) => this.#send<AdminCompetitionDetail>("GET", `/competitions/${e(id)}`);
  createCompetition = (input: { name: string; slug: string; date: string }) => this.#send<CompetitionDetail>("POST", "/competitions", input);
  patchCompetition = (id: string, changes: Record<string, unknown>) => this.#send<AdminCompetitionDetail>("PATCH", `/competitions/${e(id)}`, changes);
  transition = (id: string, action: string) => this.#send<CompetitionDetail>("POST", `/competitions/${e(id)}/transitions`, { action });
  decideSignup = (id: string, participantId: string, accept: boolean) =>
    this.#send<SignupDecisionResult>("POST", `/competitions/${e(id)}/participants/${e(participantId)}/decision`, { accept });
  newInvite = (id: string) => this.#send<NewInvite>("POST", `/competitions/${e(id)}/invite`);
  standings = (id: string) => this.#send<StandingRow[]>("GET", `/competitions/${e(id)}/standings`);
  boutHistory = (id: string) => this.#send<HistoryBout[]>("GET", `/competitions/${e(id)}/bout-history`);
  participants = (id: string) => this.#send<ParticipantRow[]>("GET", `/competitions/${e(id)}/participants`);
  addParticipant = (id: string, input: { name: string; userId: string }) => this.#send<ParticipantRow>("POST", `/competitions/${e(id)}/participants`, input);
  bout = (boutId: string) => this.#send<BoutResponse>("GET", `/bouts/${e(boutId)}`);
  resolveObjection = (boutId: string, body: ObjectionResolution) => this.#send<BoutResponse>("POST", `/bouts/${e(boutId)}/resolution`, body);
  admins = (id: string) => this.#send<CompetitionAdminEntry[]>("GET", `/competitions/${e(id)}/admins`);
  addAdmin = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("POST", `/competitions/${e(id)}/admins`, { userId });
  removeAdmin = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("DELETE", `/competitions/${e(id)}/admins/${e(userId)}`);
  transferOwnership = (id: string, userId: string) => this.#send<CompetitionAdminEntry[]>("POST", `/competitions/${e(id)}/owner`, { userId });
  searchPeople = (query: string) => this.#send<PersonSearchResult[]>("GET", `/people?q=${e(query)}`);
  clubs = () => this.#send<Club[]>("GET", "/clubs");

  liveTournaments = async () => (await this.#send<{ tournaments: LiveTournamentSummary[] }>("GET", "/live-tournaments")).tournaments;
  createLiveTournament = (input: { name: string; googleSpreadsheetId?: string }) => this.#send<{ id: string }>("POST", "/live-tournaments", input);
  liveTournament = (id: string) => this.#send<LiveTournamentDetail>("GET", `/live-tournaments/${e(id)}`);
  saveLiveRules = async (id: string, rules: RingRules) => (await this.#send<{ rules: RingRules }>("PUT", `/live-tournaments/${e(id)}/rules`, rules)).rules;
  /** Sends the .xlsx as the raw request body. */
  importWorkbook = (id: string, file: Blob) => this.#send<ImportReport>("POST", `/live-tournaments/${e(id)}/import/xlsx`, file);
  importGoogle = (id: string) => this.#send<ImportReport>("POST", `/live-tournaments/${e(id)}/import/google`);
  syncStatus = async (id: string) => (await this.#send<{ targets: SyncTarget[] }>("GET", `/live-tournaments/${e(id)}/sync`)).targets;
  /** The backup needs the sign-in header, so it is fetched (not linked) and saved from the blob. */
  downloadBackup = (id: string) => this.#api.send<Blob>("GET", `/live-tournaments/${e(id)}/backup.xlsx`, undefined, true, { responseType: "blob" });
  liveRings = async (id: string) => (await this.#send<{ rings: LiveRingLink[] }>("GET", `/live-tournaments/${e(id)}/rings`)).rings;
  rotateScoreboardToken = async (ringId: string) => (await this.#send<{ ring: LiveRingLink }>("POST", `/live-rings/${e(ringId)}/rotate-scoreboard-token`)).ring;
  setRingColors = async (ringId: string, colors: { leftColor: string; rightColor: string }) =>
    (await this.#send<{ ring: LiveRingLink }>("PUT", `/live-rings/${e(ringId)}/colors`, colors)).ring;
  rotateRingToken = async (ringId: string) => (await this.#send<{ ring: LiveRingLink }>("POST", `/live-rings/${e(ringId)}/rotate-token`)).ring;

  #send<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    return this.#api.send<T>(method, path, body, authenticated);
  }
}
