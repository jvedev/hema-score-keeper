import {
  AppsScriptClient,
  AppsScriptCompetitionSheetService,
  AppsScriptCompetitionsIndexService,
  type BoutRow,
  type CompetitionSheetService,
  type CompetitionsIndexService,
} from "@hema/sheets-client";
import { publishBoutRanking } from "@hema/ranking";
import type { RuleSet } from "@hema/match-engine";
import type { CompetitionRepository, RepositoryGetOptions } from "../competition-repository";
import type { Bout, Competition, NewBoutInput, Participant, RankingEntry } from "../../domain/competition";
import { parseRuleSet } from "../../domain/ruleset-parser";
import { getIdToken } from "../../identity/session";

export class SheetsCompetitionRepository implements CompetitionRepository {
  readonly #index: CompetitionsIndexService;
  readonly #sheets: CompetitionSheetService;
  readonly #draftBouts = new Map<string, Bout>();

  constructor() {
    const client = new AppsScriptClient({ baseUrl: requireAppsScriptUrl(), getIdToken });
    this.#index = new AppsScriptCompetitionsIndexService(client);
    this.#sheets = new AppsScriptCompetitionSheetService(client);
  }

  async listCompetitions(): Promise<Competition[]> {
    const entries = await this.#index.listCompetitions();
    return entries.map((entry) => ({
      id: entry.spreadsheetId,
      name: entry.name,
      slug: entry.spreadsheetId,
      status: "ACTIVE",
      date: entry.startDate,
      startDate: entry.startDate,
      endDate: entry.endDate,
    }));
  }

  async getCompetition(competitionId: string): Promise<Competition> {
    const settings = await this.#sheets.getSettings(competitionId);
    return {
      id: competitionId,
      name: settings.name,
      slug: competitionId,
      status: "ACTIVE",
      date: settings.startDate,
      startDate: settings.startDate,
      endDate: settings.endDate,
    };
  }

  async getRuleSet(competitionId: string): Promise<RuleSet> {
    const settings = await this.#sheets.getSettings(competitionId);
    return parseRuleSet({ id: competitionId, name: settings.name }, settings.rulesetJson);
  }

  async getRanking(competitionId: string, options: RepositoryGetOptions = {}): Promise<RankingEntry[]> {
    return this.#sheets.getRanking(competitionId, options.forceRefresh ? { forceRefresh: true } : {});
  }

  async getParticipants(competitionId: string, options: RepositoryGetOptions = {}): Promise<Participant[]> {
    const rows = await this.#sheets.getParticipants(
      competitionId,
      options.forceRefresh ? { forceRefresh: true } : {},
    );
    return rows.map((row) => ({
      id: row.id,
      competitionId,
      name: row.name,
      linkedUserEmail: row.linkedUserEmail,
    }));
  }

  async getParticipant(competitionId: string, participantId: string): Promise<Participant> {
    const participants = await this.getParticipants(competitionId);
    const participant = participants.find((candidate) => candidate.id === participantId);
    if (!participant) {
      throw new Error(`Participant "${participantId}" was not found in competition "${competitionId}".`);
    }
    return participant;
  }

  async addParticipant(competitionId: string, name: string): Promise<Participant> {
    const row = await this.#sheets.addParticipant(competitionId, name);
    return { id: row.id, competitionId, name: row.name, linkedUserEmail: row.linkedUserEmail };
  }

  async registerSelf(competitionId: string, name: string): Promise<Participant> {
    const row = await this.#sheets.registerSelf(competitionId, name);
    return { id: row.id, competitionId, name: row.name, linkedUserEmail: row.linkedUserEmail };
  }

  async getBoutsForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    const rows = await this.getBouts(competitionId);
    return rows.filter((row) => row.fighterAId === participantId || row.fighterBId === participantId);
  }

  async getMatchesForParticipant(competitionId: string, participantId: string): Promise<Bout[]> {
    return this.getBoutsForParticipant(competitionId, participantId);
  }

  async getBouts(competitionId: string): Promise<Bout[]> {
    const rows = await this.#sheets.getBouts(competitionId);
    return rows.map((row) => toBout(competitionId, row));
  }

  async getMatches(competitionId: string): Promise<Bout[]> {
    return this.getBouts(competitionId);
  }

  async getBout(competitionId: string, boutId: string): Promise<Bout> {
    const rows = await this.#sheets.getBouts(competitionId);
    const row = rows.find((candidate) => candidate.id === boutId);
    if (!row) {
      throw new Error(`Bout "${boutId}" was not found in competition "${competitionId}".`);
    }
    return toBout(competitionId, row);
  }

  async getMatch(competitionId: string, matchId: string): Promise<Bout> {
    return this.getBout(competitionId, matchId);
  }

  async createBout(competitionId: string, input: NewBoutInput): Promise<Bout> {
    await this.#requireParticipants(competitionId, input.fighterAId, input.fighterBId);
    const bout: Bout = {
      id: `bout-${crypto.randomUUID()}`,
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
    this.#draftBouts.set(bout.id, bout);
    return structuredClone(bout);
  }

  async createMatch(competitionId: string, input: NewBoutInput): Promise<Bout> {
    return this.createBout(competitionId, input);
  }

  async publishBout(competitionId: string, boutId: string, input: NewBoutInput): Promise<Bout> {
    await this.#requireParticipants(competitionId, input.fighterAId, input.fighterBId);
    const draft = this.#draftBouts.get(boutId);
    const [participants, ranking] = await Promise.all([
      this.#sheets.getParticipants(competitionId),
      this.#sheets.getRanking(competitionId),
    ]);

    const boutRow: BoutRow = {
      id: boutId,
      fighterAId: draft?.fighterAId ?? input.fighterAId,
      fighterBId: draft?.fighterBId ?? input.fighterBId,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      winnerParticipantId: input.winnerParticipantId,
      date: input.date,
      details: input.details,
    };

    const currentRatings = new Map(ranking.map((entry) => [entry.participantId, entry.rating]));
    const nextRanking = publishBoutRanking(participants, currentRatings, {
      fighterAId: boutRow.fighterAId,
      fighterBId: boutRow.fighterBId,
      winnerParticipantId: input.winnerParticipantId,
    });

    await this.#sheets.publishBout(competitionId, boutRow, nextRanking);
    this.#draftBouts.delete(boutId);
    return toBout(competitionId, boutRow);
  }

  async publishMatch(competitionId: string, matchId: string, input: NewBoutInput): Promise<Bout> {
    return this.publishBout(competitionId, matchId, input);
  }

  async declineBout(_competitionId: string, _boutId: string): Promise<Bout> {
    const draft = this.#draftBouts.get(_boutId);
    if (!draft) {
      throw new Error("Declining published bouts is not supported by the Google Sheets repository.");
    }
    this.#draftBouts.delete(_boutId);
    return structuredClone(draft);
  }

  async declineMatch(competitionId: string, matchId: string): Promise<Bout> {
    return this.declineBout(competitionId, matchId);
  }

  async #requireParticipants(competitionId: string, fighterAId: string, fighterBId: string): Promise<void> {
    if (fighterAId === fighterBId) {
      throw new Error("A bout requires two different participants.");
    }

    const participants = await this.getParticipants(competitionId);
    if (!participants.some((participant) => participant.id === fighterAId)) {
      throw new Error(`Participant "${fighterAId}" does not exist in competition "${competitionId}".`);
    }
    if (!participants.some((participant) => participant.id === fighterBId)) {
      throw new Error(`Participant "${fighterBId}" does not exist in competition "${competitionId}".`);
    }
  }
}

function toBout(competitionId: string, row: BoutRow): Bout {
  return {
    id: row.id,
    competitionId,
    fighterAId: row.fighterAId,
    fighterBId: row.fighterBId,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    winnerParticipantId: row.winnerParticipantId,
    date: row.date,
    published: true,
    details: row.details as Bout["details"],
  };
}

function requireAppsScriptUrl(): string {
  const url = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (!url) {
    throw new Error("VITE_APPS_SCRIPT_URL is not configured.");
  }
  return url;
}
