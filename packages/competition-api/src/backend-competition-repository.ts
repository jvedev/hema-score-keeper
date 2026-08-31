import type { RuleSet } from "@hema/match-engine";
import type {
  Bout,
  Competition,
  CompetitionRepository,
  Match,
  MatchDetails,
  MatchInput,
  NewBoutInput,
  Participant,
  RankingEntry,
  RepositoryGetOptions,
} from "./types.js";

interface CompetitionDetailResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  startDate: string;
  endDate: string;
  visibility?: "PUBLIC" | "CLUB_ONLY";
  clubId?: string | null;
  rulesetJson: unknown;
}

interface CompetitionSummaryResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  date: string;
  startDate: string;
  endDate: string;
  visibility?: "PUBLIC" | "CLUB_ONLY";
  clubId?: string | null;
}

interface ParticipantResponse {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
  clubId?: string | null;
  userId?: string | null;
  kind?: "MEMBER" | "GUEST";
}

interface RankingResponse {
  participantId: string;
  name: string;
  position: number;
  rating: number;
}

interface MatchResponse {
  id: string;
  competitionId: string;
  fighterAId: string;
  fighterBId: string;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  date: string;
  published: boolean;
  details: unknown;
}

export class BackendCompetitionRepository implements CompetitionRepository {
  #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async listCompetitions(): Promise<Competition[]> {
    const competitions = await this.#getJson<CompetitionSummaryResponse[]>("/api/v1/competitions");
    return competitions.map(toCompetition);
  }

  async getCompetition(competitionId: string): Promise<Competition> {
    const competition = await this.#getJson<CompetitionDetailResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}`,
    );
    return toCompetition(competition);
  }

  async getRuleSet(competitionId: string): Promise<RuleSet> {
    const competition = await this.#getJson<CompetitionDetailResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}`,
    );
    return toRuleSet(competition);
  }

  async getRanking(competitionId: string, _options: RepositoryGetOptions = {}): Promise<RankingEntry[]> {
    const ranking = await this.#getJson<RankingResponse[]>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/ranking`,
    );
    return ranking.map((entry) => ({
      participantId: entry.participantId,
      name: entry.name,
      position: entry.position,
      rating: entry.rating,
    }));
  }

  async getParticipants(competitionId: string, _options: RepositoryGetOptions = {}): Promise<Participant[]> {
    const participants = await this.#getJson<ParticipantResponse[]>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/participants`,
    );
    return participants.map((participant) => ({
      id: participant.id,
      competitionId: participant.competitionId,
      name: participant.name,
      linkedUserEmail: participant.linkedUserEmail,
      ...(participant.clubId === undefined ? {} : { clubId: participant.clubId }),
      ...(participant.userId === undefined ? {} : { userId: participant.userId }),
      ...(participant.kind === undefined ? {} : { kind: participant.kind }),
    }));
  }

  async getParticipant(competitionId: string, participantId: string): Promise<Participant> {
    const participant = await this.getParticipants(competitionId);
    const match = participant.find((candidate) => candidate.id === participantId);
    if (!match) {
      throw new Error(`Participant "${participantId}" was not found in competition "${competitionId}".`);
    }
    return match;
  }

  async getMatches(competitionId: string): Promise<Match[]> {
    const matches = await this.#getJson<MatchResponse[]>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts`,
    );
    return matches.map(toMatch);
  }

  async getBouts(competitionId: string): Promise<Bout[]> {
    return this.getMatches(competitionId);
  }

  async getMatch(competitionId: string, matchId: string): Promise<Match> {
    const match = await this.#getJson<MatchResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts/${encodeURIComponent(matchId)}`,
    );
    return toMatch(match);
  }

  async getBout(competitionId: string, boutId: string): Promise<Bout> {
    return this.getMatch(competitionId, boutId);
  }

  async getMatchesForParticipant(competitionId: string, participantId: string): Promise<Match[]> {
    const matches = await this.getMatches(competitionId);
    return matches.filter((match) => match.fighterAId === participantId || match.fighterBId === participantId);
  }

  async getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    return this.getMatchesForParticipant(competitionId, participantId);
  }

  async addParticipant(_competitionId: string, _name: string): Promise<Participant> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async registerSelf(_competitionId: string, _name: string): Promise<Participant> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async createMatch(_competitionId: string, _input: MatchInput): Promise<Match> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async createBout(competitionId: string, input: NewBoutInput): Promise<Bout> {
    return this.createMatch(competitionId, input);
  }

  async publishMatch(competitionId: string, matchId: string, input: MatchInput): Promise<Match> {
    const match = await this.#getJson<MatchResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts/${encodeURIComponent(matchId)}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
    return toMatch(match);
  }

  async publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout> {
    return this.publishMatch(competitionId, boutId, input);
  }

  async declineMatch(_competitionId: string, _matchId: string): Promise<Match> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async declineBout(_competitionId: string, _boutId: string): Promise<Bout> {
    return this.declineMatch(_competitionId, _boutId);
  }

  async #getJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "Content-Type": init.body ? "application/json" : "text/plain",
      },
      ...init,
    });

    if (!response.ok) {
      throw new Error(`Competition backend request failed for ${path}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

function toCompetition(response: CompetitionSummaryResponse): Competition {
  const competition: Competition = {
    id: response.id,
    name: response.name,
    slug: response.slug,
    status: response.status as Competition["status"],
    date: response.date,
    startDate: response.startDate,
    endDate: response.endDate,
  };
  if (response.visibility !== undefined) {
    competition.visibility = response.visibility;
  }
  if (response.clubId !== undefined) {
    competition.clubId = response.clubId;
  }
  return competition;
}

function toRuleSet(response: CompetitionDetailResponse): RuleSet {
  const raw = response.rulesetJson;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Competition "${response.id}" has an invalid ruleset.`);
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.weaponClass !== "string" || typeof data.matchParameters !== "object" || data.matchParameters === null) {
    throw new Error(`Competition "${response.id}" has an invalid ruleset.`);
  }

  return {
    id: response.id,
    name: response.name,
    version: typeof data.version === "string" ? data.version : "1.0",
    weaponClass: data.weaponClass as RuleSet["weaponClass"],
    matchParameters: data.matchParameters as RuleSet["matchParameters"],
  };
}

function toMatch(response: MatchResponse): Match {
  return {
    id: response.id,
    competitionId: response.competitionId,
    fighterAId: response.fighterAId,
    fighterBId: response.fighterBId,
    scoreA: response.scoreA,
    scoreB: response.scoreB,
    winnerParticipantId: response.winnerParticipantId,
    date: response.date,
    published: response.published,
    details: response.details as MatchDetails,
  };
}
