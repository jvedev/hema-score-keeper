import type { ArenaRepository } from "./arena-repository";
import { ApiClient } from "./api/api-client";
import { ArenaApi } from "./api/arena-api";
import { MockArenaRepository } from "./mock/mock-arena-repository";

export function createArenaRepository(): ArenaRepository {
  if (import.meta.env.VITE_USE_MOCK_API !== "false") {
    return new MockArenaRepository();
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "VITE_API_BASE_URL is required when VITE_USE_MOCK_API is false.",
    );
  }

  return new ArenaApi(new ApiClient(baseUrl));
}
