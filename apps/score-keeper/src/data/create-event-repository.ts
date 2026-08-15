import type { EventRepository } from "./event-repository";
import { EventApi } from "./api/event-api";
import { MockEventRepository } from "./mock/mock-event-repository";

export function createEventRepository(): EventRepository {
  if (import.meta.env.VITE_USE_MOCK_API !== "false") {
    return new MockEventRepository();
  }

  return new EventApi();
}
