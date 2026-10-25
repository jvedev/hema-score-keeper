import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { rootNotFoundHtml } from "./root-404.mjs";

const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script type="module" crossorigin src="/hema-score-keeper/competition/assets/index-abc.js"></script>
  </head>
  <body><div id="app"></div></body>
</html>`;
const BASE = "/hema-score-keeper/competition/";

/** Runs the inline guard the way a browser would at `pathname`; returns where it sent the page (null: it stayed). */
function visit(html, pathname) {
  const guard = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  expect(guard).toBeDefined();
  let replacedWith = null;
  runInNewContext(guard, { location: { pathname, search: "", hash: "", replace: (url) => (replacedWith = url) } });
  return replacedWith;
}

describe("the site-wide 404 page", () => {
  it("is the participant app, with its absolute asset paths", () => {
    const html = rootNotFoundHtml(APP_HTML, BASE);
    expect(html).toContain('src="/hema-score-keeper/competition/assets/index-abc.js"');
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it("boots the app in place for its own deep links", () => {
    const html = rootNotFoundHtml(APP_HTML, BASE);
    expect(visit(html, "/hema-score-keeper/competition/join/abc123")).toBeNull();
    expect(visit(html, "/hema-score-keeper/competition/competitions/x/standings")).toBeNull();
    expect(visit(html, "/hema-score-keeper/competition")).toBeNull();
  });

  it("sends paths outside the app to the app's home", () => {
    const html = rootNotFoundHtml(APP_HTML, BASE);
    expect(visit(html, "/hema-score-keeper/nope")).toBe(BASE);
    expect(visit(html, "/hema-score-keeper/competitionx/join/a")).toBe(BASE);
  });

  it("refuses a page without a head or a relative base", () => {
    expect(() => rootNotFoundHtml("<html><body></body></html>", BASE)).toThrow();
    expect(() => rootNotFoundHtml(APP_HTML, "./")).toThrow();
  });
});
