import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "../src/auth.js";

describe("resolveAuthSecret", () => {
  it("treats unset, empty and whitespace-only values as unset", () => {
    const fallback = resolveAuthSecret(undefined);
    expect(resolveAuthSecret("")).toBe(fallback);
    expect(resolveAuthSecret("   ")).toBe(fallback);
    expect(fallback).not.toBe("");
  });

  it("keeps a real secret", () => {
    expect(resolveAuthSecret("s3cret-value")).toBe("s3cret-value");
  });
});
