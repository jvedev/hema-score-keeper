import type { AdminClient } from "./admin-client";
import type { Route } from "./router";

/** What every screen gets: the API, navigation and a way to tell the admin something. */
export interface AppContext {
  client: AdminClient;
  navigate(route: Route, replace?: boolean): void;
  toast(message: string): void;
  /** Reloads the "Needs you" count shown in the navigation; returns the new count. */
  refreshNeedsYou(): Promise<number>;
  /** Sends the admin back to the sign-in page after the session ran out outside a screen load. */
  sessionExpired(): void;
}

/** A screen fills `container` and may return a function that cleans up when the screen is left. */
export type Screen = (container: HTMLElement, context: AppContext) => Promise<void | (() => void)>;
