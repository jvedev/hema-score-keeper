import type { RuleSet } from "@hema/match-engine";
import type { RuleSetRepository } from "../rule-set-repository";
import { ApiClient } from "./api-client";

interface MatchParametersResponse {
  maxDurationSeconds: number;
  stopOnTimeOut: boolean;
  maxPointsCap: number;
  pointSpreadVictory: number;
  scores: number[];
  maxDoubles: number;
  allowAfterBlow: boolean;
  countDoubles: boolean;
  useNetScore: boolean;
  penalties: Array<{
    description: string;
    penalties: number[];
    disqualify: boolean;
  }>;
}

interface RuleSetDefinitionResponse {
  weaponClass: string;
  matchParameters: MatchParametersResponse;
}

interface RuleSetResponse {
  id: string;
  name: string;
  version: number;
  definition: RuleSetDefinitionResponse | null;
  weaponClass?: string;
  matchParameters?: MatchParametersResponse;
}

export class RuleSetApi implements RuleSetRepository {
  constructor(private readonly client: ApiClient) {}

  async getRuleSet(ruleSetId: string): Promise<RuleSet> {
    const response = await this.client.get<RuleSetResponse>(
      `/rulesets/${encodeURIComponent(ruleSetId)}`,
    );
    const definition = response.definition ?? (
      response.weaponClass && response.matchParameters
        ? { weaponClass: response.weaponClass, matchParameters: response.matchParameters }
        : null
    );

    if (!definition) {
      throw new Error(`Ruleset "${ruleSetId}" is missing a definition.`);
    }

    return {
      id: ruleSetId,
      name: response.name,
      version: String(response.version),
      weaponClass: definition.weaponClass,
      matchParameters: {
        maxDurationSeconds: definition.matchParameters.maxDurationSeconds,
        stopOnTimeOut: definition.matchParameters.stopOnTimeOut,
        maxPointsCap: definition.matchParameters.maxPointsCap,
        pointSpreadVictory: definition.matchParameters.pointSpreadVictory,
        scores: definition.matchParameters.scores,
        maxDoubles: definition.matchParameters.maxDoubles,
        allowAfterBlow: definition.matchParameters.allowAfterBlow,
        countDoubles: definition.matchParameters.countDoubles,
        useNetScore: definition.matchParameters.useNetScore,
        penalties: definition.matchParameters.penalties.map((penalty) => ({
          description: penalty.description,
          penalties: penalty.penalties,
          disqualify: penalty.disqualify,
        })),
      },
    };
  }
}
