import type { ApiEvent } from "@hema/event-admin-api";
import { createApiClient } from "@hema/event-admin-api";
import type { EventRepository } from "../event-repository";

export class EventApi implements EventRepository {
  readonly #client = createApiClient();

  async listEvents(): Promise<readonly ApiEvent[]> {
    return this.#client.listEvents();
  }
}
