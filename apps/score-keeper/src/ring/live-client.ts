import { ApiSession, type AuthResponse, type Session as ApiSessionState } from "@hema/api-session";
import type { LiveExchangeInput } from "./exchange-mapping";
import { newId } from "./ids";

export { ApiError, SessionExpiredError } from "@hema/api-session";

export interface LiveUser {
  id: string;
  name: string;
  language: "en" | "nl";
}

export type LiveSession = ApiSessionState<LiveUser>;

/** The same key and shape as the score-keeper's competition sign-in, so both share one login. */
const SESSION_KEY = "hema-score-keeper.session";
const DEVICE_KEY = "hema-score-keeper.device-id";
const CLAIMS_KEY = "hema-score-keeper.ring-claims";
/** Per ring: the ring token the stored claim was made under (a different token later means the link was rotated). */
const CLAIM_TOKENS_KEY = "hema-score-keeper.ring-claim-tokens";
/** A request that has not answered (headers and body) after this long is given up; the outbox then treats it as offline. */
export const REQUEST_TIMEOUT_MS = 12_000;

/** Who keeps a ring right now, as the backend reports it. */
export interface ActiveKeeper {
  userName: string;
  since: string;
}

export interface LiveRing {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
}

export interface BoutClock {
  seconds: number;
  running: boolean;
  updatedAt: string | null;
}

export interface BoutScore {
  left: number;
  right: number;
  doubles: number;
}

export interface LiveBoutRow {
  id: string;
  ringId: string;
  order: number;
  label: string | null;
  fighterLeft: string;
  fighterRight: string;
  status: "PENDING" | "RUNNING" | "DONE";
  score: BoutScore | null;
  clock: BoutClock;
}

export interface ServerExchange {
  id: string;
  clientExchangeId: string;
  kind: "EXCHANGE" | "DEDUCTION";
  leftPoints: number;
  rightPoints: number;
  isDouble: boolean;
  firstScorer: "LEFT" | "RIGHT" | null;
  seq: number;
  undoneAt: string | null;
}

export interface RingByToken {
  ring: LiveRing;
  tournament: { id: string; name: string; mode: string };
  bouts: LiveBoutRow[];
  activeKeeper: ActiveKeeper | null;
  /** This device is the ring's active keeper (the server compares the X-Device-Id it was sent). */
  youAreKeeper: boolean;
}

export interface BoutDetail {
  bout: LiveBoutRow;
  exchanges: ServerExchange[];
  score: BoutScore;
  clock: BoutClock;
}

export type ExchangeToSend = LiveExchangeInput & { clientExchangeId: string };

export interface AcknowledgedExchange {
  exchange: { id: string; clientExchangeId: string };
}

/** What the outbox needs to send. `LiveClient` is the real one; tests use a fake. */
export interface LiveWriter {
  startBout(ringToken: string, boutId: string): Promise<unknown>;
  finishBout(ringToken: string, boutId: string): Promise<unknown>;
  setClock(ringToken: string, boutId: string, clock: { seconds: number; running: boolean }): Promise<unknown>;
  undo(ringToken: string, boutId: string, expectedExchangeId: string): Promise<unknown>;
  postExchange(ringToken: string, boutId: string, exchange: ExchangeToSend): Promise<AcknowledgedExchange>;
}

/** This device's id, made once (a random UUID, with a fallback where `crypto.randomUUID` is missing) and kept. The backend tells keepers apart by it. */
export function getDeviceId(storage: Storage = localStorage): string {
  try {
    const stored = storage.getItem(DEVICE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Unreadable storage: fall through to a fresh id.
  }
  const id = newId();
  try {
    storage.setItem(DEVICE_KEY, id);
  } catch {
    // Not storable: this id lasts as long as the page.
  }
  return id;
}

/** The rings this device has claimed: ring id to when. Opening a ring link again need not claim (a claim pauses the clock). */
export function readRingClaims(storage: Storage = localStorage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CLAIMS_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function recordRingClaim(storage: Storage, ringId: string, claimedAt: string, ringToken?: string): void {
  storage.setItem(CLAIMS_KEY, JSON.stringify({ ...readRingClaims(storage), [ringId]: claimedAt }));
  if (ringToken !== undefined) {
    storage.setItem(CLAIM_TOKENS_KEY, JSON.stringify({ ...readClaimTokens(storage), [ringId]: ringToken }));
  }
}

function readClaimTokens(storage: Storage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CLAIM_TOKENS_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

/** The ring token this device's stored claim for the ring was made under; null when unknown (or no claim). */
export function ringClaimToken(storage: Storage, ringId: string): string | null {
  return readClaimTokens(storage)[ringId] ?? null;
}

/** Forget a claim, for instance when this device was taken over or the link was rotated. */
export function forgetRingClaim(storage: Storage, ringId: string): void {
  const { [ringId]: _gone, ...rest } = readRingClaims(storage);
  storage.setItem(CLAIMS_KEY, JSON.stringify(rest));
  const { [ringId]: _token, ...tokens } = readClaimTokens(storage);
  storage.setItem(CLAIM_TOKENS_KEY, JSON.stringify(tokens));
}

const e = encodeURIComponent;

/** The live (ring mode) API. Sign-in, tokens and refresh come from `@hema/api-session`; every write carries the ring and device headers. */
export class LiveClient implements LiveWriter {
  readonly #api: ApiSession<LiveUser>;
  readonly deviceId: string;

  constructor(
    baseUrl: string,
    private readonly storage: Storage = localStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {
    this.deviceId = getDeviceId(storage);
    this.#api = new ApiSession<LiveUser>({
      baseUrl,
      storage,
      storageKey: SESSION_KEY,
      toUser: (user) => ({ id: user.id, name: user.name, language: user.language === "nl" ? "nl" : "en" }),
    });
  }

  currentSession(): LiveSession | null {
    return this.#api.current();
  }

  async login(username: string, password: string): Promise<LiveSession> {
    return this.#api.store(await this.#api.send<AuthResponse>("POST", "/auth/login", { username, password, rememberMe: true }, false, { timeoutMs: this.timeoutMs }));
  }

  logout(): Promise<void> {
    return this.#api.logout();
  }

  hasClaim(ringId: string): boolean {
    return ringId in readRingClaims(this.storage);
  }

  /** The ring token the stored claim was made under (null for a claim stored before tokens were kept). */
  claimToken(ringId: string): string | null {
    return this.hasClaim(ringId) ? ringClaimToken(this.storage, ringId) : null;
  }

  /**
   * The ring behind a link, with its bouts, who keeps it now and whether this device does (it sends its device id
   * for that). A rotated or unknown link is a 404.
   */
  ringByToken = (ringToken: string) =>
    this.#api.send<RingByToken>("GET", `/live-rings/by-token/${e(ringToken)}`, undefined, true, { headers: { "X-Device-Id": this.deviceId }, timeoutMs: this.timeoutMs });

  /** The bout with its stored exchanges, to reconcile an outbox against. */
  getBout = (boutId: string) => this.#api.send<BoutDetail>("GET", `/live-bouts/${e(boutId)}`, undefined, true, { timeoutMs: this.timeoutMs });

  /**
   * Makes this device the ring's keeper (and pauses the ring's clocks). Another active keeper gives a 409 `ACTIVE_KEEPER`
   * unless `confirm` is set. The claim is remembered for the ring when it succeeds.
   */
  async claim(ringToken: string, ringId: string, options: { confirm?: boolean } = {}): Promise<{ ring: LiveRing }> {
    const body = { deviceId: this.deviceId, ...(options.confirm ? { confirm: true } : {}) };
    const result = await this.#write<{ ring: LiveRing }>("POST", `/live-rings/by-token/${e(ringToken)}/claim`, ringToken, body);
    recordRingClaim(this.storage, ringId, this.now().toISOString(), ringToken);
    return result;
  }

  startBout = (ringToken: string, boutId: string) => this.#write<unknown>("POST", `/live-bouts/${e(boutId)}/start`, ringToken, {});
  finishBout = (ringToken: string, boutId: string) => this.#write<unknown>("POST", `/live-bouts/${e(boutId)}/finish`, ringToken, {});
  setClock = (ringToken: string, boutId: string, clock: { seconds: number; running: boolean }) =>
    this.#write<unknown>("POST", `/live-bouts/${e(boutId)}/clock`, ringToken, { seconds: clock.seconds, running: clock.running });
  undo = (ringToken: string, boutId: string, expectedExchangeId: string) =>
    this.#write<unknown>("POST", `/live-bouts/${e(boutId)}/undo`, ringToken, { expectedExchangeId });
  postExchange = (ringToken: string, boutId: string, exchange: ExchangeToSend) =>
    this.#write<AcknowledgedExchange>("POST", `/live-bouts/${e(boutId)}/exchanges`, ringToken, exchange);

  #write<T>(method: string, path: string, ringToken: string, body: unknown): Promise<T> {
    return this.#api.send<T>(method, path, body, true, { headers: { "X-Ring-Token": ringToken, "X-Device-Id": this.deviceId }, timeoutMs: this.timeoutMs });
  }
}
