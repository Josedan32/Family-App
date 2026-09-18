import { describe, expect, it } from "vitest";

import {
  isDataUrlTooLarge,
  isSupportedImageFile,
  squareCropRect,
} from "../avatarImage";

describe("isSupportedImageFile", () => {
  it("accepts image mime types", () => {
    expect(isSupportedImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
  });

  it("rejects non-image mime types", () => {
    expect(isSupportedImageFile(new File([""], "a.pdf", { type: "application/pdf" }))).toBe(
      false,
    );
  });
});

describe("squareCropRect", () => {
  it("centers a square crop on a wide image", () => {
    expect(squareCropRect(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });

  it("centers a square crop on a tall image", () => {
    expect(squareCropRect(100, 200)).toEqual({ sx: 0, sy: 50, size: 100 });
  });

  it("leaves an already-square image untouched", () => {
    expect(squareCropRect(128, 128)).toEqual({ sx: 0, sy: 0, size: 128 });
  });
});

describe("isDataUrlTooLarge", () => {
  it("passes a short data URL", () => {
    expect(isDataUrlTooLarge("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("flags a data URL over the cap", () => {
    expect(isDataUrlTooLarge("a".repeat(200_001))).toBe(true);
  });
});
