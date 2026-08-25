import type { AppsScriptClient } from "./apps-script-client.js";
import type { RulesetEntry } from "./types.js";

export interface RulesetLibraryService {
  listRulesets(): Promise<RulesetEntry[]>;
}

export class AppsScriptRulesetLibraryService implements RulesetLibraryService {
  readonly #client: AppsScriptClient;

  constructor(client: AppsScriptClient) {
    this.#client = client;
  }

  async listRulesets(): Promise<RulesetEntry[]> {
    return this.#client.get<RulesetEntry[]>("listRulesets");
  }
}

export class MockRulesetLibraryService implements RulesetLibraryService {
  readonly #entries: RulesetEntry[];

  constructor(entries: readonly RulesetEntry[] = []) {
    this.#entries = structuredClone(entries) as RulesetEntry[];
  }

  async listRulesets(): Promise<RulesetEntry[]> {
    return structuredClone(this.#entries);
  }
}
