import { t } from "@hema/ui";
import { href, type NavItem, type Route } from "./router";

export type { NavItem };

const NAV: ReadonlyArray<{ item: NavItem; label: string; icon: string }> = [
  { item: "home", label: "app.home", icon: "M3 11 12 4l9 7v9h-6v-6H9v6H3z" },
  { item: "competitions", label: "app.competitions", icon: "M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a4 4 0 0 0 4 4M19 5h2v2a4 4 0 0 1-4 4M12 13v4m-4 3h8" },
  { item: "profile", label: "app.profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8a8 8 0 0 1 16 0" },
];

export interface Shell {
  content: HTMLElement;
  setActive(item: NavItem | null): void;
  setUser(name: string): void;
  toast(message: string): void;
  relabel(): void;
}

function links(): string {
  return NAV.map(
    ({ item, label, icon }) =>
      `<a href="${href({ name: item })}" data-nav="${item}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><span data-text="${label}"></span></a>`,
  ).join("");
}

/** The frame around every screen: a sidebar from 900px wide, bottom tabs below (Home · Competitions · Profile). */
export function createShell(root: HTMLElement, handlers: { navigate(route: Route): void }): Shell {
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <p class="brand" data-text="app.title"></p>
        <nav class="nav" aria-label="Main">${links()}</nav>
        <p class="user"></p>
      </aside>
      <main class="content" id="content"></main>
      <nav class="tab-bar" aria-label="Main">${links()}</nav>
      <div class="toast" role="status" hidden></div>
    </div>`;

  const content = root.querySelector<HTMLElement>("#content")!;
  const toastElement = root.querySelector<HTMLElement>(".toast")!;
  let toastTimer: number | undefined;
  let userName = "";

  root.querySelectorAll<HTMLAnchorElement>("a[data-nav]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      handlers.navigate({ name: link.dataset.nav as NavItem });
    });
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
    setUser(name) {
      userName = name;
      root.querySelector(".user")!.textContent = t("app.signedInAs", { name });
    },
    toast(message) {
      toastElement.textContent = message;
      toastElement.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastElement.hidden = true;
      }, 4000);
    },
    relabel() {
      root.querySelectorAll<HTMLElement>("[data-text]").forEach((element) => {
        element.textContent = t(element.dataset.text as Parameters<typeof t>[0]);
      });
      if (userName) {
        shell.setUser(userName);
      }
    },
  };
  shell.relabel();
  return shell;
}
