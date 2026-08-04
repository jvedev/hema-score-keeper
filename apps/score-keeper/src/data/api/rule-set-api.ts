import type { RuleSet } from "../../domain/rule-set";
import type { RuleSetRepository } from "../rule-set-repository";
import { ApiClient } from "./api-client";

interface RuleSetResponse {
  ruleSetName: string;
  version: string;
  weaponClass: string;
  matchParameters: {
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
  };
}

export class RuleSetApi implements RuleSetRepository {
  constructor(private readonly client: ApiClient) {}

  async getRuleSet(ruleSetId: string): Promise<RuleSet> {
    const response = await this.client.get<RuleSetResponse>(
      `/api/v1/rule-set/${encodeURIComponent(ruleSetId)}`,
    );

    return {
      id: ruleSetId,
      name: response.ruleSetName,
      version: response.version,
      weaponClass: response.weaponClass,
      matchParameters: {
        maxDurationSeconds: response.matchParameters.maxDurationSeconds,
        stopOnTimeOut: response.matchParameters.stopOnTimeOut,
        maxPointsCap: response.matchParameters.maxPointsCap,
        pointSpreadVictory: response.matchParameters.pointSpreadVictory,
        scores: response.matchParameters.scores,
        maxDoubles: response.matchParameters.maxDoubles,
        allowAfterBlow: response.matchParameters.allowAfterBlow,
        countDoubles: response.matchParameters.countDoubles,
        useNetScore: response.matchParameters.useNetScore,
        penalties: response.matchParameters.penalties.map((penalty) => ({
          description: penalty.description,
          penalties: penalty.penalties,
          disqualify: penalty.disqualify,
        })),
      },
    };
  }
}
