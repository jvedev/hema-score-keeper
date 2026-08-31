import type { RuleSet } from "@hema/match-engine";
import type {
  Bout,
  Competition,
  CompetitionRepository,
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
}

interface ParticipantResponse {
  id: string;
  competitionId: string;
  name: string;
  linkedUserEmail: string | null;
}

interface RankingResponse {
  participantId: string;
  name: string;
  position: number;
  rating: number;
}

interface BoutResponse {
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

  async getBouts(competitionId: string): Promise<Bout[]> {
    const bouts = await this.#getJson<BoutResponse[]>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts`,
    );
    return bouts.map(toBout);
  }

  async getBout(competitionId: string, boutId: string): Promise<Bout> {
    const bout = await this.#getJson<BoutResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts/${encodeURIComponent(boutId)}`,
    );
    return toBout(bout);
  }

  async getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    const bouts = await this.getBouts(competitionId);
    return bouts.filter((bout) => bout.fighterAId === participantId || bout.fighterBId === participantId);
  }

  async addParticipant(_competitionId: string, _name: string): Promise<Participant> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async registerSelf(_competitionId: string, _name: string): Promise<Participant> {
    throw new Error("Competition write operations are not available through the backend repository yet.");
  }

  async createBout(_competitionId: string, _input: NewBoutInput): Promise<Bout> {
    const bout = await this.#getJson<BoutResponse>(
      `/api/v1/competitions/${encodeURIComponent(_competitionId)}/bouts`,
      {
        method: "POST",
        body: JSON.stringify(_input),
      },
    );
    return toBout(bout);
  }

  async publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout> {
    const bout = await this.#getJson<BoutResponse>(
      `/api/v1/competitions/${encodeURIComponent(competitionId)}/bouts/${encodeURIComponent(boutId)}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
    return toBout(bout);
  }

  async declineBout(_competitionId: string, _boutId: string): Promise<Bout> {
    const bout = await this.#getJson<BoutResponse>(
      `/api/v1/competitions/${encodeURIComponent(_competitionId)}/bouts/${encodeURIComponent(_boutId)}`,
      {
        method: "DELETE",
      },
    );
    return toBout(bout);
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
  return {
    id: response.id,
    name: response.name,
    slug: response.slug,
    status: response.status as Competition["status"],
    date: response.date,
    startDate: response.startDate,
    endDate: response.endDate,
  };
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

function toBout(response: BoutResponse): Bout {
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
    details: response.details,
  };
}
