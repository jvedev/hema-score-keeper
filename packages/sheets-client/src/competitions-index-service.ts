import type { AppsScriptClient } from "./apps-script-client.js";
import type { CompetitionIndexEntry } from "./types.js";

export interface CompetitionsIndexService {
  listCompetitions(): Promise<CompetitionIndexEntry[]>;
}

export class AppsScriptCompetitionsIndexService implements CompetitionsIndexService {
  readonly #client: AppsScriptClient;

  constructor(client: AppsScriptClient) {
    this.#client = client;
  }

  async listCompetitions(): Promise<CompetitionIndexEntry[]> {
    return this.#client.get<CompetitionIndexEntry[]>("listCompetitions");
  }
}

export class MockCompetitionsIndexService implements CompetitionsIndexService {
  readonly #entries: CompetitionIndexEntry[];

  constructor(entries: readonly CompetitionIndexEntry[] = []) {
    this.#entries = structuredClone(entries) as CompetitionIndexEntry[];
  }

  async listCompetitions(): Promise<CompetitionIndexEntry[]> {
    return structuredClone(this.#entries);
  }
}
