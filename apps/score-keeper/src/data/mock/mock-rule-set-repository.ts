import type { RuleSet } from "../../domain/rule-set";
import type { RuleSetRepository } from "../rule-set-repository";
import { ruleSets } from "./fixtures/rule-sets";

export class MockRuleSetRepository implements RuleSetRepository {
  async getRuleSet(ruleSetId: string): Promise<RuleSet> {
    const ruleSet = ruleSets[ruleSetId];
    if (!ruleSet) {
      throw new Error(`Mock rule set "${ruleSetId}" does not exist.`);
    }

    return structuredClone(ruleSet);
  }
}
