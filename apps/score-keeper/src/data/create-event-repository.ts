import type { EventRepository } from "./event-repository";
import { EventApi } from "./api/event-api";
import { MockEventRepository } from "./mock/mock-event-repository";
import { shouldUseMockApi } from "./use-mock-api";

export function createEventRepository(): EventRepository {
  if (shouldUseMockApi()) {
    return new MockEventRepository();
  }

  return new EventApi();
}
