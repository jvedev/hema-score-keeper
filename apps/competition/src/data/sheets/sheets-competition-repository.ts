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
      startDate: entry.startDate,
      endDate: entry.endDate,
    }));
  }

  async getCompetition(competitionId: string): Promise<Competition> {
    const settings = await this.#sheets.getSettings(competitionId);
    return {
      id: competitionId,
      name: settings.name,
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
    const rows = await this.#sheets.getBouts(competitionId);
    return rows
      .filter((row) => row.fighterAId === participantId || row.fighterBId === participantId)
      .map((row) => toBout(competitionId, row));
  }

  async getBout(competitionId: string, boutId: string): Promise<Bout> {
    const rows = await this.#sheets.getBouts(competitionId);
    const row = rows.find((candidate) => candidate.id === boutId);
    if (!row) {
      throw new Error(`Bout "${boutId}" was not found in competition "${competitionId}".`);
    }
    return toBout(competitionId, row);
  }

  async publishBout(competitionId: string, input: NewBoutInput): Promise<Bout> {
    const [participants, ranking] = await Promise.all([
      this.#sheets.getParticipants(competitionId),
      this.#sheets.getRanking(competitionId),
    ]);

    const boutRow: BoutRow = {
      id: `bout-${crypto.randomUUID()}`,
      fighterAId: input.fighterAId,
      fighterBId: input.fighterBId,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      winnerParticipantId: input.winnerParticipantId,
      date: input.date,
      details: input.details,
    };

    const currentRatings = new Map(ranking.map((entry) => [entry.participantId, entry.rating]));
    const nextRanking = publishBoutRanking(participants, currentRatings, {
      fighterAId: input.fighterAId,
      fighterBId: input.fighterBId,
      winnerParticipantId: input.winnerParticipantId,
    });

    await this.#sheets.publishBout(competitionId, boutRow, nextRanking);
    return toBout(competitionId, boutRow);
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
  };
}

function requireAppsScriptUrl(): string {
  const url = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (!url) {
    throw new Error("VITE_APPS_SCRIPT_URL is not configured.");
  }
  return url;
}
