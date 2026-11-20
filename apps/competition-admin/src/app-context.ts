import type { AdminClient } from "./admin-client";
import type { Route } from "./router";

/** What every screen gets: the API, navigation and a way to tell the admin something. */
export interface AppContext {
  client: AdminClient;
  navigate(route: Route, replace?: boolean): void;
  /** The URL of a route in the host app (standalone Competition-admin or the Event-admin shell). */
  href(route: Route): string;
  toast(message: string): void;
  /** Reloads the "Needs you" count shown in the navigation; returns the new count. */
  refreshNeedsYou(): Promise<number>;
  /**
   * Only in the standalone app: the Event-admin page of a competition attached to an Event, linked from its
   * header. Hosted inside Event-admin the breadcrumb already shows the Event, so this is absent.
   */
  eventHref?(eventId: string, competitionId: string): string;
  /**
   * Only when hosted inside an Event's workspace: detaches the Competition from that Event (its data and own
   * admins stay). Absent in the standalone app.
   */
  detachFromEvent?(): Promise<void>;
  /** Sends the admin back to the sign-in page after the session ran out outside a screen load. */
  sessionExpired(): void;
}

/** A screen fills `container` and may return a function that cleans up when the screen is left. */
export type Screen = (container: HTMLElement, context: AppContext) => Promise<void | (() => void)>;
