import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopedStyles } from "./hosted-styles";

describe("scopedStyles", () => {
  it("wraps the sheet in @scope, moves :root variables to the scope root and drops the page rule", () => {
    const css = ":root {\n  --ink: #fff;\n}\n\nhtml,\nbody {\n  margin: 0;\n}\n\nh1 {\n  color: var(--ink);\n}\n";
    const result = scopedStyles(css, ".hosted");
    expect(result.startsWith("@scope (.hosted) {")).toBe(true);
    expect(result).toContain(":scope {\n  --ink: #fff;");
    expect(result).not.toContain(":root");
    expect(result).not.toMatch(/html,\s*body/);
    expect(result).toContain("h1 {\n  color: var(--ink);");
  });

  it("handles the real Competition-admin stylesheet", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const result = scopedStyles(css, ".hosted");
    expect(result).not.toContain(":root");
    expect(result).not.toMatch(/html,\s*body\s*\{/);
    expect(result.split("{").length).toBe(result.split("}").length);
  });
});
