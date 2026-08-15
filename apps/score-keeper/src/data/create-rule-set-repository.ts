import { ApiClient } from "./api/api-client";
import { RuleSetApi } from "./api/rule-set-api";
import { MockRuleSetRepository } from "./mock/mock-rule-set-repository";
import type { RuleSetRepository } from "./rule-set-repository";
import { shouldUseMockApi } from "./use-mock-api";

export function createRuleSetRepository(): RuleSetRepository {
  if (shouldUseMockApi()) {
    return new MockRuleSetRepository();
  }

  return new RuleSetApi(new ApiClient(import.meta.env.VITE_API_BASE_URL ?? "/api/v1"));
}
