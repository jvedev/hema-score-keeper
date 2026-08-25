import type { RuleSet } from "@hema/match-engine";

export interface RuleSetRepository {
  getRuleSet(ruleSetId: string): Promise<RuleSet>;
}
