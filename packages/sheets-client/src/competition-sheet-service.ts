import type { AppsScriptClient } from "./apps-script-client.js";
import type { BoutRow, CompetitionSettings, ParticipantRow, RankingRow } from "./types.js";

export interface GetOptions {
  forceRefresh?: boolean;
}

export interface CompetitionSheetService {
  getSettings(spreadsheetId: string): Promise<CompetitionSettings>;
  getRanking(spreadsheetId: string, options?: GetOptions): Promise<RankingRow[]>;
  getParticipants(spreadsheetId: string, options?: GetOptions): Promise<ParticipantRow[]>;
  getBouts(spreadsheetId: string): Promise<BoutRow[]>;
  addParticipant(spreadsheetId: string, name: string): Promise<ParticipantRow>;
  registerSelf(spreadsheetId: string, name: string): Promise<ParticipantRow>;
  publishBout(spreadsheetId: string, bout: BoutRow, ranking: readonly RankingRow[]): Promise<void>;
}

export class AppsScriptCompetitionSheetService implements CompetitionSheetService {
  readonly #client: AppsScriptClient;

  constructor(client: AppsScriptClient) {
    this.#client = client;
  }

  async getSettings(spreadsheetId: string): Promise<CompetitionSettings> {
    return this.#client.get<CompetitionSettings>("getCompetition", { spreadsheetId });
  }

  async getRanking(spreadsheetId: string, options: GetOptions = {}): Promise<RankingRow[]> {
    return this.#client.get<RankingRow[]>(
      "getRanking",
      { spreadsheetId },
      options.forceRefresh ? { bypassCache: true } : {},
    );
  }

  async getParticipants(spreadsheetId: string, options: GetOptions = {}): Promise<ParticipantRow[]> {
    return this.#client.get<ParticipantRow[]>(
      "getParticipants",
      { spreadsheetId },
      options.forceRefresh ? { bypassCache: true } : {},
    );
  }

  async getBouts(spreadsheetId: string): Promise<BoutRow[]> {
    return this.#client.get<BoutRow[]>("getBouts", { spreadsheetId });
  }

  async addParticipant(spreadsheetId: string, name: string): Promise<ParticipantRow> {
    return this.#client.post<ParticipantRow>("addParticipant", { spreadsheetId, name });
  }

  async registerSelf(spreadsheetId: string, name: string): Promise<ParticipantRow> {
    return this.#client.post<ParticipantRow>("registerSelf", { spreadsheetId, name });
  }

  async publishBout(spreadsheetId: string, bout: BoutRow, ranking: readonly RankingRow[]): Promise<void> {
    await this.#client.post<{ published: true }>("publishBout", { spreadsheetId, bout, ranking });
  }
}

export interface CompetitionSeed {
  settings: CompetitionSettings;
  ranking?: readonly RankingRow[];
  participants?: readonly ParticipantRow[];
  bouts?: readonly BoutRow[];
}

interface MutableCompetitionSeed {
  settings: CompetitionSettings;
  ranking: RankingRow[];
  participants: ParticipantRow[];
  bouts: BoutRow[];
}

export interface MockCompetitionSheetServiceOptions {
  currentUserEmail?: string;
}

export class MockCompetitionSheetService implements CompetitionSheetService {
  readonly #competitions = new Map<string, MutableCompetitionSeed>();
  readonly #currentUserEmail: string;
  #nextId = 1000;

  constructor(seeds: Record<string, CompetitionSeed>, options: MockCompetitionSheetServiceOptions = {}) {
    this.#currentUserEmail = options.currentUserEmail ?? "you@example.com";
    for (const [spreadsheetId, seed] of Object.entries(seeds)) {
      this.#competitions.set(spreadsheetId, {
        settings: structuredClone(seed.settings),
        ranking: structuredClone(seed.ranking ?? []) as RankingRow[],
        participants: structuredClone(seed.participants ?? []) as ParticipantRow[],
        bouts: structuredClone(seed.bouts ?? []) as BoutRow[],
      });
    }
  }

  async getSettings(spreadsheetId: string): Promise<CompetitionSettings> {
    return structuredClone(this.#require(spreadsheetId).settings);
  }

  async getRanking(spreadsheetId: string, _options: GetOptions = {}): Promise<RankingRow[]> {
    return structuredClone(this.#require(spreadsheetId).ranking);
  }

  async getParticipants(spreadsheetId: string, _options: GetOptions = {}): Promise<ParticipantRow[]> {
    return structuredClone(this.#require(spreadsheetId).participants);
  }

  async getBouts(spreadsheetId: string): Promise<BoutRow[]> {
    return structuredClone(this.#require(spreadsheetId).bouts);
  }

  async addParticipant(spreadsheetId: string, name: string): Promise<ParticipantRow> {
    const competition = this.#require(spreadsheetId);
    const participant: ParticipantRow = {
      id: `participant-${this.#nextId++}`,
      name,
      linkedUserEmail: null,
    };
    competition.participants.push(participant);
    return structuredClone(participant);
  }

  async registerSelf(spreadsheetId: string, name: string): Promise<ParticipantRow> {
    const competition = this.#require(spreadsheetId);
    const participant: ParticipantRow = {
      id: `participant-${this.#nextId++}`,
      name,
      linkedUserEmail: this.#currentUserEmail,
    };
    competition.participants.push(participant);
    return structuredClone(participant);
  }

  async publishBout(spreadsheetId: string, bout: BoutRow, ranking: readonly RankingRow[]): Promise<void> {
    const competition = this.#require(spreadsheetId);
    competition.bouts.push(structuredClone(bout));
    competition.ranking = structuredClone(ranking) as RankingRow[];
  }

  #require(spreadsheetId: string): MutableCompetitionSeed {
    const competition = this.#competitions.get(spreadsheetId);
    if (!competition) {
      throw new Error(`Mock competition sheet "${spreadsheetId}" does not exist.`);
    }
    return competition;
  }
}
