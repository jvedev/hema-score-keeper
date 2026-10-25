import { escapeHtml, t } from "@hema/ui";
import type { AppContext } from "../app-context";
import { homeBlocks, type HomeBlock } from "../mappers/home";
import type { TodoAction } from "../todo-actions";

const TODO_EVENTS = [
  ["todo-approve", "approve"],
  ["todo-object", "object"],
  ["todo-withdraw", "withdraw"],
  ["todo-referee-approve", "referee-approve"],
] as const satisfies ReadonlyArray<readonly [keyof HTMLElementEventMap, TodoAction]>;

type Renderers = { [K in HomeBlock["kind"]]: (block: Extract<HomeBlock, { kind: K }>, context: AppContext) => HTMLElement };

/** Draws each kind of home block. A new block kind gets its renderer here. */
const RENDERERS: Renderers = {
  todo(block, context) {
    const section = document.createElement("section");
    section.className = "block";
    section.innerHTML = `<todo-list></todo-list><p class="error" role="alert" hidden></p>`;
    const list = section.querySelector("todo-list")!;
    const error = section.querySelector<HTMLElement>(".error")!;
    list.items = block.items;
    // The list has no busy state of its own: make it inert while a request runs.
    const feedback = {
      setBusy(busy: boolean) {
        list.inert = busy;
        list.setAttribute("aria-busy", String(busy));
      },
      setError(message: string | null) {
        error.textContent = message ?? "";
        error.hidden = message === null;
      },
      stillShown: () => section.isConnected,
    };
    for (const [event, action] of TODO_EVENTS) {
      list.addEventListener(event, (fired) => {
        if (!list.inert) {
          void context.todoAction(action, fired.detail.boutId, feedback);
        }
      });
    }
    return section;
  },
  "my-competitions"(block, context) {
    const section = document.createElement("section");
    section.className = "block";
    section.innerHTML = `<h2>${t("app.myCompetitions")}</h2><my-competition-list></my-competition-list>`;
    const list = section.querySelector("my-competition-list")!;
    list.items = block.items;
    list.addEventListener("competition-selected", (event) => context.navigate({ name: "competition", competitionId: event.detail.competitionId }));
    return section;
  },
  "no-competitions"(_block, context) {
    const section = document.createElement("section");
    section.className = "panel block";
    section.innerHTML = `<h2>${t("app.myCompetitions")}</h2><p class="muted">${t("app.noCompetitions")}</p>
      <div class="row"><button type="button" class="primary">${t("app.findCompetition")}</button></div>`;
    section.querySelector("button")!.addEventListener("click", () => context.navigate({ name: "competitions" }));
    return section;
  },
};

/** Home: the blocks the app chose (to-do when there is any, then my competitions). */
export async function renderHomeScreen(container: HTMLElement, context: AppContext): Promise<void> {
  const home = await context.client.home();
  const name = context.client.currentSession()?.user.name ?? "";
  container.innerHTML = `<div><p class="eyebrow">${escapeHtml(t("app.signedInAs", { name }))}</p><h1>${t("app.home")}</h1></div>`;
  for (const block of homeBlocks(home, context.homeBlocks)) {
    const render = RENDERERS[block.kind] as (block: HomeBlock, context: AppContext) => HTMLElement;
    container.append(render(block, context));
  }
}
