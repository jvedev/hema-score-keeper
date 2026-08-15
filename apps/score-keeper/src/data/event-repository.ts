import type { ApiEvent } from "@hema/event-admin-api";

export interface EventRepository {
  listEvents(): Promise<readonly ApiEvent[]>;
}
