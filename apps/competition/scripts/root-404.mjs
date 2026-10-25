/**
 * GitHub Pages only uses the 404.html at the root of the published site, so a fresh visit to a deep link such as
 * <origin>/hema-score-keeper/competition/join/<code> gets that page. This builds it from the participant app's own
 * 404.html (the app itself, with absolute asset paths): paths under the app's base boot the app in place, and any
 * other path on the site is sent to the app's home. Add a prefix here if another app is ever published on the site.
 *
 * Usage: node root-404.mjs <app 404.html> <output 404.html> <app base, e.g. /hema-score-keeper/competition/>
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function rootNotFoundHtml(appHtml, base) {
  if (!base.startsWith("/") || !base.endsWith("/")) {
    throw new Error(`The app base must be absolute and end in "/": ${base}`);
  }
  const head = /<head[^>]*>/i.exec(appHtml);
  if (!head) {
    throw new Error("The app's 404.html has no <head>.");
  }
  // A classic inline script runs before the app's module script, so the app never starts outside its base.
  const guard =
    `<script>(function(){var b=${JSON.stringify(base)},p=location.pathname;` +
    `if(p.indexOf(b)!==0&&p+"/"!==b){location.replace(b);}})();</script>`;
  const at = head.index + head[0].length;
  return `${appHtml.slice(0, at)}\n    ${guard}${appHtml.slice(at)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [source, target, base] = process.argv.slice(2);
  if (!source || !target || !base) {
    console.error("Usage: node root-404.mjs <app 404.html> <output 404.html> <app base>");
    process.exit(1);
  }
  await writeFile(target, rootNotFoundHtml(await readFile(source, "utf8"), base));
}
