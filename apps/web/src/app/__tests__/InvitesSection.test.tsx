import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildInviteLink,
  buildShareMessage,
  copyToClipboard,
  handleShare,
} from "../(app)/hogar/InvitesSection";

// Mock pushToast
vi.mock("@/lib/toast", () => ({
  pushToast: vi.fn(),
}));

const ORIGIN = "https://familyhub.example.com";

describe("buildInviteLink", () => {
  it("builds a deep link carrying the code so it never has to be typed in", () => {
    expect(buildInviteLink(ORIGIN, "ABCD1234")).toBe(
      "https://familyhub.example.com/onboarding/hogar?code=ABCD1234",
    );
  });
});

describe("buildShareMessage", () => {
  it("builds a message with the invite code and its deep link", () => {
    const message = buildShareMessage("ABCD1234", ORIGIN);
    expect(message).toBe(
      "Únete a mi hogar con este código: ABCD1234\nhttps://familyhub.example.com/onboarding/hogar?code=ABCD1234",
    );
  });

  it("handles codes with different characters", () => {
    const message = buildShareMessage("XYZQ9876", ORIGIN);
    expect(message).toContain("XYZQ9876");
    expect(message).toContain("code=XYZQ9876");
  });

  it("correctly URL-encodes the message for WhatsApp sharing", () => {
    const message = buildShareMessage("TEST5678", ORIGIN);
    const encoded = encodeURIComponent(message);
    expect(decodeURIComponent(encoded)).toBe(message);
  });
});

describe("copyToClipboard", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("copies text to clipboard and shows success toast", async () => {
    const { pushToast } = await import("@/lib/toast");
    const result = await copyToClipboard("test text");

    expect(writeText).toHaveBeenCalledWith("test text");
    expect(result).toBe(true);
    expect(pushToast).toHaveBeenCalledWith({ message: "Copiado", type: "success" });
  });

  it("shows error toast and returns false when clipboard fails", async () => {
    const { pushToast } = await import("@/lib/toast");
    const error = new Error("Clipboard denied");
    writeText.mockRejectedValue(error);

    const result = await copyToClipboard("test text");

    expect(result).toBe(false);
    expect(pushToast).toHaveBeenCalledWith({ message: "Error al copiar", type: "danger" });
  });
});

describe("handleShare", () => {
  let navigatorShare: ReturnType<typeof vi.fn>;
  let windowOpen: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigatorShare = vi.fn();
    windowOpen = vi.fn();
    writeText = vi.fn().mockResolvedValue(undefined);

    Object.assign(navigator, { share: navigatorShare, clipboard: { writeText } });
    Object.assign(window, { open: windowOpen });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up navigator.share
    delete (navigator as Partial<Navigator>).share;
  });

  it("uses navigator.share when available and successful, with the link included", async () => {
    const { pushToast } = await import("@/lib/toast");
    navigatorShare.mockResolvedValue(undefined);

    await handleShare("ABCD1234", ORIGIN);

    expect(navigatorShare).toHaveBeenCalledWith({
      text: "Únete a mi hogar con este código: ABCD1234\nhttps://familyhub.example.com/onboarding/hogar?code=ABCD1234",
    });
    expect(pushToast).toHaveBeenCalledWith({ message: "Compartido", type: "success" });
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("falls back to wa.me when navigator.share is unavailable", async () => {
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue({});

    await handleShare("ABCD1234", ORIGIN);

    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank"
    );
  });

  it("does NOT fall back to wa.me when user cancels (AbortError)", async () => {
    navigatorShare.mockRejectedValue(new DOMException("User cancelled", "AbortError"));

    await handleShare("ABCD1234", ORIGIN);

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("falls back to wa.me when navigator.share fails with non-abort error", async () => {
    navigatorShare.mockRejectedValue(new Error("Share failed"));
    windowOpen.mockReturnValue({});

    await handleShare("ABCD1234", ORIGIN);

    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank"
    );
  });

  it("falls back to clipboard when wa.me popup is blocked (window.open returns null)", async () => {
    const { pushToast } = await import("@/lib/toast");
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue(null);

    await handleShare("ABCD1234", ORIGIN);

    expect(writeText).toHaveBeenCalledWith(
      "Únete a mi hogar con este código: ABCD1234\nhttps://familyhub.example.com/onboarding/hogar?code=ABCD1234",
    );
    expect(pushToast).toHaveBeenCalledWith({ message: "Copiado", type: "success" });
  });

  it("includes the correct URL-encoded message in wa.me link", async () => {
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue({});

    await handleShare("TEST5678", ORIGIN);

    const expectedEncoded = encodeURIComponent(buildShareMessage("TEST5678", ORIGIN));
    expect(windowOpen).toHaveBeenCalledWith(
      `https://wa.me/?text=${expectedEncoded}`,
      "_blank"
    );
  });
});
