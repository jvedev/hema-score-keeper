import type { RuleSet } from "../domain/rule-set";

export interface RuleSetRepository {
  getRuleSet(ruleSetId: string): Promise<RuleSet>;
}
