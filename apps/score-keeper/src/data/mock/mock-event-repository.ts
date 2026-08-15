import type { ApiEvent } from "@hema/event-admin-api";
import type { EventRepository } from "../event-repository";
import { events } from "./fixtures/events";

export class MockEventRepository implements EventRepository {
  async listEvents(): Promise<readonly ApiEvent[]> {
    return structuredClone(events);
  }
}
