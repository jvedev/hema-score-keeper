import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../i18n/i18n.js";
import "./invite-share.js";
import type { InviteShare } from "./invite-share.js";

const link = "https://example.org/join/abc123?x=<b>";
const mounted: InviteShare[] = [];

function mount(value?: string): InviteShare {
  const share = document.createElement("invite-share");
  if (value !== undefined) {
    share.link = value;
  }
  document.body.appendChild(share);
  mounted.push(share);
  return share;
}

const $ = (share: InviteShare, selector: string) => share.shadowRoot!.querySelector<HTMLElement>(selector);

afterEach(() => {
  mounted.splice(0).forEach((share) => share.remove());
  vi.restoreAllMocks();
  setLocale("en");
});

describe("invite-share", () => {
  it("shows the link, a copy button and a QR code", () => {
    const share = mount(link);
    expect(($(share, "input.link") as HTMLInputElement).value).toBe(link);
    expect($(share, "button.copy")!.textContent).toBe("Copy link");
    const qr = $(share, "svg.qr")!;
    expect(qr.getAttribute("role")).toBe("img");
    expect(qr.getAttribute("aria-label")).toBe("QR code for the invite link");
    expect(qr.querySelectorAll("path.modules")).toHaveLength(1);
  });

  it("keeps a light quiet zone around the code", () => {
    const share = mount(link);
    expect($(share, "svg.qr rect.bg")!.getAttribute("fill")).toBe("#fff");
    const [, , size] = $(share, "svg.qr")!.getAttribute("viewBox")!.split(" ").map(Number);
    // At least version 1 (21 modules) plus a 4-module quiet zone on each side.
    expect(size).toBeGreaterThanOrEqual(21 + 8);
  });

  it("redraws when the link changes", () => {
    const share = mount(link);
    const before = $(share, "svg.qr")!.innerHTML;
    share.setAttribute("link", "https://example.org/join/zzz999");
    expect($(share, "svg.qr")!.innerHTML).not.toBe(before);
    expect(($(share, "input.link") as HTMLInputElement).value).toBe("https://example.org/join/zzz999");
  });

  it("copies the link with the Clipboard API and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    const share = mount(link);
    const copied: unknown[] = [];
    share.addEventListener("invite-copied", (event) => copied.push(event.detail));
    $(share, "button.copy")!.click();
    await vi.waitFor(() => expect($(share, "button.copy")!.textContent).toBe("Copied"));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(copied).toEqual([{ link }]);
  });

  it("falls back to selecting the link and tells the user when copying fails", async () => {
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText: vi.fn().mockRejectedValue(new Error("denied")) } as unknown as Clipboard);
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const share = mount(link);
    $(share, "button.copy")!.click();
    await vi.waitFor(() => expect($(share, ".note")!.textContent).toContain("Copying didn't work"));
  });

  it("uses execCommand when the Clipboard API is missing", async () => {
    const exec = vi.spyOn(document, "execCommand").mockReturnValue(true);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(undefined as unknown as Clipboard);
    const share = mount(link);
    $(share, "button.copy")!.click();
    await vi.waitFor(() => expect($(share, "button.copy")!.textContent).toBe("Copied"));
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("renders nothing without a link", () => {
    const share = mount();
    expect($(share, "input.link")).toBeNull();
    expect($(share, "svg.qr")).toBeNull();
  });

  it("escapes the link", () => {
    const share = mount(link);
    expect(share.shadowRoot!.querySelector("b")).toBeNull();
  });

  it("stays hidden with the hidden attribute", () => {
    const share = mount(link);
    share.setAttribute("hidden", "");
    expect(getComputedStyle(share).display).toBe("none");
  });

  it("renders in Dutch", () => {
    const share = mount(link);
    setLocale("nl");
    expect($(share, "button.copy")!.textContent).toBe("Link kopiëren");
  });
});
