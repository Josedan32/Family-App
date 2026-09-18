import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildShareMessage, copyToClipboard, handleShare } from "../(app)/hogar/InvitesSection";

// Mock pushToast
vi.mock("@/lib/toast", () => ({
  pushToast: vi.fn(),
}));

describe("buildShareMessage", () => {
  it("builds a message with the invite code", () => {
    const message = buildShareMessage("ABCD1234");
    expect(message).toBe("Únete a mi hogar con este código: ABCD1234");
  });

  it("handles codes with different characters", () => {
    const message = buildShareMessage("XYZQ9876");
    expect(message).toBe("Únete a mi hogar con este código: XYZQ9876");
  });

  it("correctly URL-encodes the message for WhatsApp sharing", () => {
    const message = buildShareMessage("TEST5678");
    const encoded = encodeURIComponent(message);
    // Verify that the encoded string can be safely used in a URL
    expect(encoded).toBe("%C3%9Anete%20a%20mi%20hogar%20con%20este%20c%C3%B3digo%3A%20TEST5678");
    // Verify the encoded string can be decoded back
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

  it("uses navigator.share when available and successful", async () => {
    const { pushToast } = await import("@/lib/toast");
    navigatorShare.mockResolvedValue(undefined);

    await handleShare("ABCD1234");

    expect(navigatorShare).toHaveBeenCalledWith({ text: "Únete a mi hogar con este código: ABCD1234" });
    expect(pushToast).toHaveBeenCalledWith({ message: "Compartido", type: "success" });
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("falls back to wa.me when navigator.share is unavailable", async () => {
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue({});

    await handleShare("ABCD1234");

    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank"
    );
  });

  it("does NOT fall back to wa.me when user cancels (AbortError)", async () => {
    navigatorShare.mockRejectedValue(new DOMException("User cancelled", "AbortError"));

    await handleShare("ABCD1234");

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("falls back to wa.me when navigator.share fails with non-abort error", async () => {
    navigatorShare.mockRejectedValue(new Error("Share failed"));
    windowOpen.mockReturnValue({});

    await handleShare("ABCD1234");

    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank"
    );
  });

  it("falls back to clipboard when wa.me popup is blocked (window.open returns null)", async () => {
    const { pushToast } = await import("@/lib/toast");
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue(null);

    await handleShare("ABCD1234");

    expect(writeText).toHaveBeenCalledWith("Únete a mi hogar con este código: ABCD1234");
    expect(pushToast).toHaveBeenCalledWith({ message: "Copiado", type: "success" });
  });

  it("includes the correct URL-encoded message in wa.me link", async () => {
    delete (navigator as Partial<Navigator>).share;
    windowOpen.mockReturnValue({});

    await handleShare("TEST5678");

    const expectedEncoded = encodeURIComponent("Únete a mi hogar con este código: TEST5678");
    expect(windowOpen).toHaveBeenCalledWith(
      `https://wa.me/?text=${expectedEncoded}`,
      "_blank"
    );
  });
});
