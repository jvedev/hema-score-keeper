import { t } from "@hema/ui";
import { href, type Route } from "./router";

export type NavItem = "needs-you" | "competitions";

export interface Shell {
  content: HTMLElement;
  setActive(item: NavItem | null): void;
  setNeedsYouCount(count: number): void;
  setUser(name: string, language: "en" | "nl"): void;
  toast(message: string): void;
  relabel(): void;
}

/**
 * The frame around every screen: a dark sidebar on wide screens, bottom tabs on phones.
 * "Needs you" only shows while something needs the admin.
 */
export function createShell(
  root: HTMLElement,
  handlers: { navigate(route: Route): void; signOut(): void; changeLanguage(language: "en" | "nl"): void },
): Shell {
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <p class="brand"><span data-text="admin.title"></span></p>
        <nav class="nav" aria-label="Main">
          <a href="${href({ name: "needs-you" })}" data-nav="needs-you" hidden><span data-text="admin.needsYou"></span><span class="count"></span></a>
          <a href="${href({ name: "competitions" })}" data-nav="competitions"><span data-text="admin.competitions"></span></a>
        </nav>
        <div class="account">
          <span class="user"></span>
          <label class="language"><span data-text="admin.language"></span>
            <select><option value="en">English</option><option value="nl">Nederlands</option></select>
          </label>
          <button type="button" class="sign-out" data-text="admin.signOut"></button>
        </div>
      </aside>
      <main class="content" id="content"></main>
      <nav class="tabs" aria-label="Main">
        <a href="${href({ name: "needs-you" })}" data-nav="needs-you" hidden><span data-text="admin.needsYou"></span><span class="count"></span></a>
        <a href="${href({ name: "competitions" })}" data-nav="competitions"><span data-text="admin.competitions"></span></a>
      </nav>
      <div class="toast" role="status" hidden></div>
    </div>`;

  const content = root.querySelector<HTMLElement>("#content")!;
  const toastElement = root.querySelector<HTMLElement>(".toast")!;
  let toastTimer: number | undefined;

  root.querySelectorAll<HTMLAnchorElement>("a[data-nav]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      handlers.navigate({ name: link.dataset.nav as NavItem });
    });
  });
  root.querySelector(".sign-out")!.addEventListener("click", () => handlers.signOut());
  root.querySelector<HTMLSelectElement>(".language select")!.addEventListener("change", (event) => {
    handlers.changeLanguage((event.target as HTMLSelectElement).value === "nl" ? "nl" : "en");
  });

  const shell: Shell = {
    content,
    setActive(item) {
      root.querySelectorAll<HTMLElement>("a[data-nav]").forEach((link) => {
        if (link.dataset.nav === item) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    },
    setNeedsYouCount(count) {
      root.querySelectorAll<HTMLElement>('a[data-nav="needs-you"]').forEach((link) => {
        link.hidden = count === 0;
        link.querySelector(".count")!.textContent = count > 0 ? String(count) : "";
      });
    },
    setUser(name, language) {
      root.querySelector(".user")!.textContent = t("admin.signedInAs", { name });
      root.querySelector<HTMLSelectElement>(".language select")!.value = language;
    },
    toast(message) {
      toastElement.textContent = message;
      toastElement.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastElement.hidden = true;
      }, 3000);
    },
    relabel() {
      root.querySelectorAll<HTMLElement>("[data-text]").forEach((element) => {
        element.textContent = t(element.dataset.text as Parameters<typeof t>[0]);
      });
    },
  };
  shell.relabel();
  return shell;
}
