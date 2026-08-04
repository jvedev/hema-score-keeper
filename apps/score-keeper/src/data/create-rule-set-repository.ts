import { ApiClient } from "./api/api-client";
import { RuleSetApi } from "./api/rule-set-api";
import { MockRuleSetRepository } from "./mock/mock-rule-set-repository";
import type { RuleSetRepository } from "./rule-set-repository";

export function createRuleSetRepository(): RuleSetRepository {
  if (import.meta.env.VITE_USE_MOCK_API !== "false") {
    return new MockRuleSetRepository();
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "VITE_API_BASE_URL is required when VITE_USE_MOCK_API is false.",
    );
  }

  return new RuleSetApi(new ApiClient(baseUrl));
}
