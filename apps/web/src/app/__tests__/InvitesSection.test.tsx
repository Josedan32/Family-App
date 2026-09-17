import { describe, expect, it } from "vitest";

import { buildShareMessage } from "../(app)/hogar/InvitesSection";

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
