import type { Route } from "../router";

/** Builds the URL for a route; the standalone app and the Event-admin shell each supply their own. */
export type RouteHref = (route: Route) => string;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The attributes of an in-app link: a real `href` (so opening in a new tab works) plus the route itself,
 * which `wireRouteLinks` hands to the host's navigation instead of reloading the page.
 */
export function routeLinkAttributes(route: Route, href: RouteHref): string {
  return `href="${escapeAttribute(href(route))}" data-route="${escapeAttribute(JSON.stringify(route))}"`;
}

/** Makes every link built with `routeLinkAttributes` inside `container` navigate through `navigate`. */
export function wireRouteLinks(container: HTMLElement, navigate: (route: Route) => void): void {
  container.querySelectorAll<HTMLAnchorElement>("a[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      navigate(JSON.parse(link.dataset.route!) as Route);
    });
  });
}
