import { runBoutAction, type ActionFeedback } from "./actions";
import type { AppContext } from "./app-context";
import type { BoutAction } from "./mappers/bout-actions";

/** The four buttons of the home to-do list (events `todo-approve`, `todo-object`, `todo-withdraw`, `todo-referee-approve`). */
export type TodoAction = BoutAction;

/** Handles a to-do button with the same code as the bout page, then reloads Home so the done item disappears (unless the fighter has already left Home). */
export async function handleTodoAction(action: TodoAction, boutId: string, context: AppContext, feedback: ActionFeedback): Promise<void> {
  if ((await runBoutAction(context, action, boutId, feedback)) && feedback.stillShown()) {
    context.navigate({ name: "home" }, true);
  }
}
