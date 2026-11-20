/**
 * Confines the Competition-admin stylesheet to `scopeSelector`, so its element rules (h1, button, input…)
 * cannot restyle the host shell. Its `:root` custom properties move to the scope root, where the hosted
 * screens still inherit them; the page-level `html, body` rule is dropped because the host owns the page.
 */
export function scopedStyles(css: string, scopeSelector: string): string {
  const body = css
    .replace(/(^|\})\s*:root\s*\{/g, "$1\n:scope {")
    .replace(/(^|\})\s*html,\s*body\s*\{[^}]*\}/g, "$1");
  return `@scope (${scopeSelector}) {\n${body}\n}\n`;
}
