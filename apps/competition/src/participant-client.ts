import { ApiSession, type AuthResponse, type Session as ApiSessionState } from "@hema/api-session";
import type {
  Account,
  BoutView,
  Club,
  CompetitionDetail,
  CompetitionParticipant,
  HistoryBout,
  InvitePreview,
  JoinableCompetition,
  Language,
  LeaveResult,
  MeHome,
  ParticipantUser,
  SignUpInput,
  SignupResult,
  StandingRow,
} from "./api-types";

export { ApiError, SessionExpiredError } from "@hema/api-session";

export type Session = ApiSessionState<ParticipantUser>;

const SESSION_KEY = "hema-competition.session";

const e = encodeURIComponent;

/** The participant app's API. Tokens and the shared refresh live in `@hema/api-session`, as in the admin app. */
export class ParticipantClient {
  readonly #api: ApiSession<ParticipantUser>;

  constructor(baseUrl: string, storage: Storage = localStorage) {
    this.#api = new ApiSession<ParticipantUser>({
      baseUrl,
      storage,
      storageKey: SESSION_KEY,
      toUser: (user) => ({ id: user.id, name: user.name, language: user.language === "nl" ? "nl" : "en", clubId: user.clubId ?? null }),
    });
  }

  currentSession(): Session | null {
    return this.#api.current();
  }

  async login(username: string, password: string): Promise<Session> {
    return this.#api.store(await this.#send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false));
  }

  /** Creates the account (signed in straight away), then saves the chosen language on it. */
  async signUp(input: SignUpInput): Promise<Session> {
    const { language, ...account } = input;
    this.#api.store(await this.#send<AuthResponse>("POST", "/auth/register", account, false));
    // The account exists now; a failed language save shouldn't undo the sign-up. The app still uses the choice.
    await this.setLanguage(language).catch(() => undefined);
    this.#api.update({ language });
    return this.#api.current()!;
  }

  logout(): Promise<void> {
    return this.#api.logout();
  }

  async setLanguage(language: Language): Promise<void> {
    await this.#send<Account>("PATCH", "/auth/me", { language });
    this.#api.update({ language });
  }

  me = () => this.#send<Account>("GET", "/auth/me");
  home = () => this.#send<MeHome>("GET", "/me/home");
  /** Signs the fighter up; an invite code lets them past the competition's scope. */
  signup = (competitionId: string, inviteCode?: string) =>
    this.#send<SignupResult>("POST", `/competitions/${e(competitionId)}/signup`, inviteCode ? { inviteCode } : {});
  /** Leaves a competition, or withdraws a sign-up that is still waiting for the organiser. */
  leave = (competitionId: string) => this.#send<LeaveResult>("DELETE", `/competitions/${e(competitionId)}/signup`);
  joinable = () => this.#send<JoinableCompetition[]>("GET", "/me/joinable");
  competition = (id: string) => this.#send<CompetitionDetail>("GET", `/competitions/${e(id)}`);
  participants = (id: string) => this.#send<CompetitionParticipant[]>("GET", `/competitions/${e(id)}/participants`);
  standings = (id: string) => this.#send<StandingRow[]>("GET", `/competitions/${e(id)}/standings`);
  boutHistory = (id: string) => this.#send<HistoryBout[]>("GET", `/competitions/${e(id)}/bout-history`);
  /** The bout as this fighter may see it (the server leaves out other people's warnings and objection reasons). */
  boutView = (competitionId: string, boutId: string) =>
    this.#send<BoutView>("GET", `/competitions/${e(competitionId)}/bouts/${e(boutId)}/view`);
  approveBout = (boutId: string) => this.#send<unknown>("POST", `/bouts/${e(boutId)}/approval`, {});
  objectToBout = (boutId: string, reason: string) => this.#send<unknown>("POST", `/bouts/${e(boutId)}/objection`, { reason });
  withdrawObjection = (boutId: string) => this.#send<unknown>("POST", `/bouts/${e(boutId)}/objection/withdrawal`, {});
  /** Approval later, in the app: the fighters aren't there to approve on the spot. */
  approveAsReferee = (boutId: string) =>
    this.#send<unknown>("POST", `/bouts/${e(boutId)}/referee-approval`, { fightersApprovedOnSpot: { A: false, B: false } });
  invite = (code: string) => this.#send<InvitePreview>("GET", `/invites/${e(code)}`, undefined, false);
  clubs = () => this.#send<Club[]>("GET", "/clubs", undefined, false);

  #send<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    return this.#api.send<T>(method, path, body, authenticated);
  }
}
