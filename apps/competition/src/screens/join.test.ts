import { describe, expect, it, vi } from "vitest";
import { escapeHtml } from "../../../../packages/ui/src/utils/escape-html";

// The real @hema/ui defines custom elements, which need a browser; the invite card only needs these two.
vi.mock("@hema/ui", () => ({ escapeHtml, t: (key: string) => key }));

const { inviteCard } = await import("./join");

describe("invite card", () => {
  it("escapes the lifecycle label (an unknown status shows as its key)", () => {
    const html = inviteCard({ kind: "open", competitionId: "c1", name: "Ladder", status: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("lifecycle.&lt;img src=x onerror=alert(1)&gt;");
  });
});
