export type AccountRole = "USER" | "COMPETITION_ADMIN" | "SYSTEM_ADMIN";
export type AccessVisibility = "PUBLIC" | "CLUB_ONLY";

export interface Club {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  clubId: string | null;
  username: string;
  role: AccountRole;
  status: string;
}

export interface Competition {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  visibility: AccessVisibility;
  clubId: string | null;
}

export interface Participant {
  id: string;
  competitionId: string;
  name: string;
  displayName: string | null;
  clubId: string | null;
  userId: string | null;
  kind: "MEMBER" | "GUEST";
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
}

interface ApiErrorPayload {
  error?: string;
}

const STORAGE_KEY = "hema-competition-admin-session";

export class CompetitionAdminApi {
  private session: ApiSession | null = readStoredSession();

  constructor(private readonly baseUrl = import.meta.env.VITE_COMPETITION_API_URL ?? "http://127.0.0.1:3001") {}

  getSession(): ApiSession | null {
    return this.session;
  }

  setSession(session: ApiSession | null): void {
    this.session = session;
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async login(input: { clubSlug: string; username: string; password: string; rememberMe: boolean }): Promise<User> {
    const response = await this.request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }, false);
    this.setSession({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    return response.user;
  }

  async me(): Promise<User> {
    return this.request<User>("/api/v1/auth/me");
  }

  async logout(): Promise<void> {
    if (!this.session) {
      return;
    }
    await this.request<{ ok: boolean }>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    }, false);
    this.setSession(null);
  }

  async listClubs(): Promise<Club[]> {
    return this.request<Club[]>("/api/v1/clubs");
  }

  async createClub(input: { name: string; slug: string }): Promise<Club> {
    return this.request<Club>("/api/v1/clubs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listUsers(): Promise<User[]> {
    return this.request<User[]>("/api/v1/users");
  }

  async createUser(input: {
    clubId: string | null;
    username: string;
    passwordHash?: string | null;
    emailHash?: string | null;
    role?: AccountRole;
    status?: string;
  }): Promise<User> {
    return this.request<User>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateUser(id: string, input: Partial<{ clubId: string | null; username: string; role: AccountRole; status: string }>): Promise<User> {
    return this.request<User>(`/api/v1/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async createEnrollmentToken(userId: string): Promise<{ token: string; expiresAt: string; defaultClubId: string | null; defaultClubSlug: string | null }> {
    return this.request<{ token: string; expiresAt: string; defaultClubId: string | null; defaultClubSlug: string | null }>("/api/v1/auth/enrollment-tokens", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  }

  async listCompetitions(): Promise<Competition[]> {
    return this.request<Competition[]>("/api/v1/competitions/admin");
  }

  async createCompetition(input: {
    name: string;
    slug: string;
    date: string;
    status: string;
    visibility: AccessVisibility;
    clubId: string | null;
    rulesetJson?: unknown;
  }): Promise<Competition> {
    return this.request<Competition>("/api/v1/competitions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateCompetition(id: string, input: Partial<{
    name: string;
    slug: string;
    date: string;
    status: string;
    visibility: AccessVisibility;
    clubId: string | null;
    rulesetJson: unknown;
  }>): Promise<Competition> {
    return this.request<Competition>(`/api/v1/competitions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async listParticipants(competitionId: string): Promise<Participant[]> {
    return this.request<Participant[]>(`/api/v1/competitions/${encodeURIComponent(competitionId)}/participants`);
  }

  async createParticipant(
    competitionId: string,
    input: { name: string; displayName?: string; clubId?: string | null; userId?: string | null; linkedUserEmail?: string | null; kind?: "MEMBER" | "GUEST" },
  ): Promise<Participant> {
    return this.request<Participant>(`/api/v1/competitions/${encodeURIComponent(competitionId)}/participants`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (this.session?.accessToken) {
      headers.set("Authorization", `Bearer ${this.session.accessToken}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401 && retry && this.session?.refreshToken) {
      await this.refresh();
      return this.request<T>(path, init, false);
    }

    if (!response.ok) {
      throw new Error(await this.readError(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private async refresh(): Promise<void> {
    if (!this.session?.refreshToken) {
      throw new Error("No session available.");
    }

    const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    });
    if (!response.ok) {
      this.setSession(null);
      throw new Error(await this.readError(response));
    }

    const payload = (await response.json()) as AuthResponse;
    this.setSession({ accessToken: payload.accessToken, refreshToken: payload.refreshToken });
  }

  private async readError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      return payload.error ?? response.statusText;
    } catch {
      return response.statusText;
    }
  }
}

function readStoredSession(): ApiSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as ApiSession;
    if (typeof session.accessToken === "string" && typeof session.refreshToken === "string") {
      return session;
    }
  } catch {
    // Ignore malformed storage.
  }

  return null;
}
