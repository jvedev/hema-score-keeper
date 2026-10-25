import type { ActionFeedback } from "./actions";
import type { HomeBlockSource } from "./mappers/home";
import type { ParticipantClient } from "./participant-client";
import type { Route } from "./router";
import type { TodoAction } from "./todo-actions";

/** What every screen gets: the API, navigation and a way to tell the fighter something. */
export interface AppContext {
  client: ParticipantClient;
  navigate(route: Route, replace?: boolean): void;
  toast(message: string): void;
  /** The blocks on the home screen, in order. The app chooses them; a tournament mode can put its own first. */
  homeBlocks: readonly HomeBlockSource[];
  /** A to-do button was pressed (approve, object, withdraw, approve as referee); `feedback` is the to-do list's busy state and error line. */
  todoAction(action: TodoAction, boutId: string, feedback: ActionFeedback): Promise<void>;
  /** The language changed: relabel the frame around the screens (sidebar, tabs). */
  relabel(): void;
  signOut(): void;
  /** The login ran out outside a screen load: show sign-in for the current address (an invite landing keeps its code). */
  sessionExpired(): void;
}
