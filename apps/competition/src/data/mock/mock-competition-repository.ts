import { applyEloBout, DEFAULT_ELO_RATING } from "@hema/ranking";
import type { RuleSet } from "@hema/match-engine";
import type { CompetitionRepository, RepositoryGetOptions } from "../competition-repository";
import type { Bout, Competition, NewBoutInput, Participant, RankingEntry } from "../../domain/competition";
import { bouts as boutFixtures, competitions as competitionFixtures, participants as participantFixtures } from "./fixtures/competitions";
import { mockRuleSet } from "./fixtures/ruleset";
import { requireCurrentUser } from "../../identity/session";

export class MockCompetitionRepository implements CompetitionRepository {
  #competitions: Competition[] = structuredClone(competitionFixtures) as Competition[];
  #participants: Participant[] = structuredClone(participantFixtures) as Participant[];
  #bouts: Bout[] = structuredClone(boutFixtures) as Bout[];
  #nextId = 1000;

  async listCompetitions(): Promise<Competition[]> {
    return structuredClone(this.#competitions);
  }

  async getCompetition(competitionId: string): Promise<Competition> {
    return structuredClone(this.#requireCompetition(competitionId));
  }

  async getRuleSet(competitionId: string): Promise<RuleSet> {
    this.#requireCompetition(competitionId);
    return structuredClone(mockRuleSet);
  }

  async getBouts(competitionId: string): Promise<Bout[]> {
    return structuredClone(
      this.#bouts.filter((bout) => bout.competitionId === competitionId && bout.published),
    );
  }

  async getMatches(competitionId: string): Promise<Bout[]> {
    return this.getBouts(competitionId);
  }

  async getRanking(competitionId: string, _options: RepositoryGetOptions = {}): Promise<RankingEntry[]> {
    let ratings = new Map<string, number>();
    for (const participant of this.#participants) {
      if (participant.competitionId === competitionId) {
        ratings.set(participant.id, DEFAULT_ELO_RATING);
      }
    }

    const publishedBouts = this.#bouts
      .filter((bout) => bout.competitionId === competitionId && bout.published)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const bout of publishedBouts) {
      ratings = applyEloBout(ratings, {
        fighterAId: bout.fighterAId,
        fighterBId: bout.fighterBId,
        winnerParticipantId: bout.winnerParticipantId,
      });
    }

    return [...ratings.entries()]
      .map(([participantId, rating]) => ({
        participantId,
        name: this.#requireParticipant(competitionId, participantId).name,
        rating,
        position: 0,
      }))
      .sort((a, b) => b.rating - a.rating)
      .map((entry, index) => ({ ...entry, position: index + 1 }));
  }

  async getParticipants(competitionId: string, _options: RepositoryGetOptions = {}): Promise<Participant[]> {
    return structuredClone(
      this.#participants.filter((participant) => participant.competitionId === competitionId),
    );
  }

  async getParticipant(competitionId: string, participantId: string): Promise<Participant> {
    return structuredClone(this.#requireParticipant(competitionId, participantId));
  }

  async addParticipant(competitionId: string, name: string): Promise<Participant> {
    this.#requireCompetition(competitionId);
    const participant: Participant = {
      id: `participant-${this.#nextId++}`,
      competitionId,
      name,
      linkedUserEmail: null,
    };
    this.#participants.push(participant);
    return structuredClone(participant);
  }

  async registerSelf(competitionId: string, name: string): Promise<Participant> {
    this.#requireCompetition(competitionId);
    const participant: Participant = {
      id: `participant-${this.#nextId++}`,
      competitionId,
      name,
      linkedUserEmail: requireCurrentUser().email,
    };
    this.#participants.push(participant);
    return structuredClone(participant);
  }

  async getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    return structuredClone(
      this.#bouts.filter(
        (bout) =>
          bout.competitionId === competitionId &&
          bout.published &&
          (bout.fighterAId === participantId || bout.fighterBId === participantId),
      ),
    );
  }

  async getMatchesForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    return this.getBoutsForParticipant(competitionId, participantId);
  }

  async getBout(competitionId: string, boutId: string): Promise<Bout> {
    return structuredClone(this.#requireBout(competitionId, boutId));
  }

  async getMatch(competitionId: string, matchId: string): Promise<Bout> {
    return this.getBout(competitionId, matchId);
  }

  async createBout(competitionId: string, input: NewBoutInput): Promise<Bout> {
    this.#requireParticipant(competitionId, input.fighterAId);
    this.#requireParticipant(competitionId, input.fighterBId);

    const bout: Bout = {
      id: `bout-${this.#nextId++}`,
      competitionId,
      fighterAId: input.fighterAId,
      fighterBId: input.fighterBId,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      winnerParticipantId: input.winnerParticipantId,
      date: input.date,
      published: false,
      details: input.details,
    };
    this.#bouts.push(bout);
    return structuredClone(bout);
  }

  async createMatch(competitionId: string, input: NewBoutInput): Promise<Bout> {
    return this.createBout(competitionId, input);
  }

  async publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout> {
    const bout = this.#requireBout(competitionId, boutId);
    this.#requireParticipant(competitionId, input.fighterAId);
    this.#requireParticipant(competitionId, input.fighterBId);

    bout.fighterAId = input.fighterAId;
    bout.fighterBId = input.fighterBId;
    bout.scoreA = input.scoreA;
    bout.scoreB = input.scoreB;
    bout.winnerParticipantId = input.winnerParticipantId;
    bout.date = input.date;
    bout.published = true;
    bout.details = input.details;
    return structuredClone(bout);
  }

  async publishMatch(competitionId: string, matchId: string, input: NewBoutInput): Promise<Bout> {
    return this.publishBout(competitionId, matchId, input);
  }

  async declineBout(competitionId: string, boutId: string): Promise<Bout> {
    const bout = this.#requireBout(competitionId, boutId);
    if (bout.published) {
      throw new Error(`Mock bout "${boutId}" is already published and cannot be declined.`);
    }
    this.#bouts = this.#bouts.filter((candidate) => candidate.id !== bout.id);
    return structuredClone(bout);
  }

  async declineMatch(competitionId: string, matchId: string): Promise<Bout> {
    return this.declineBout(competitionId, matchId);
  }

  #requireCompetition(competitionId: string): Competition {
    const competition = this.#competitions.find((candidate) => candidate.id === competitionId);
    if (!competition) {
      throw new Error(`Mock competition "${competitionId}" does not exist.`);
    }
    return competition;
  }

  #requireParticipant(competitionId: string, participantId: string): Participant {
    const participant = this.#participants.find(
      (candidate) => candidate.competitionId === competitionId && candidate.id === participantId,
    );
    if (!participant) {
      throw new Error(`Mock participant "${participantId}" does not exist in competition "${competitionId}".`);
    }
    return participant;
  }

  #requireBout(competitionId: string, boutId: string): Bout {
    const bout = this.#bouts.find(
      (candidate) => candidate.competitionId === competitionId && candidate.id === boutId,
    );
    if (!bout) {
      throw new Error(`Mock bout "${boutId}" does not exist in competition "${competitionId}".`);
    }
    return bout;
  }
}
