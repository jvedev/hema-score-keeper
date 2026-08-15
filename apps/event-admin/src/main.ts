import "@hema/ui/event-planner-view";
import "@hema/ui/event-view";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) {
  throw new Error("App root not found.");
}
const app: HTMLElement = appRoot;

function renderRoute(): void {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const tagName = path === "/planning" ? "event-planner-view" : "event-view";
  if (app.firstElementChild?.tagName.toLowerCase() === tagName) {
    return;
  }

  app.replaceChildren(document.createElement(tagName));
}

window.addEventListener("popstate", renderRoute);
window.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[data-route]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
    return;
  }

  const destination = new URL(link.href);
  if (destination.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", `${destination.pathname}${destination.search}${destination.hash}`);
  renderRoute();
});

renderRoute();
