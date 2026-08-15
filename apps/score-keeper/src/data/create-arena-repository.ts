import type { ArenaRepository } from "./arena-repository";
import { ApiClient } from "./api/api-client";
import { ArenaApi } from "./api/arena-api";
import { MockArenaRepository } from "./mock/mock-arena-repository";
import { shouldUseMockApi } from "./use-mock-api";

export function createArenaRepository(): ArenaRepository {
  if (shouldUseMockApi()) {
    return new MockArenaRepository();
  }

  return new ArenaApi(new ApiClient(import.meta.env.VITE_API_BASE_URL ?? "/api/v1"));
}
