import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ApiError } from "../errors";

const sessionSource = readFileSync(
  join(process.cwd(), "src/lib/session.ts"),
  "utf8",
);

describe("session storage", () => {
  it("never touches localStorage or sessionStorage", () => {
    // A refresh token in web storage is readable by any XSS. httpOnly only.
    expect(sessionSource).not.toContain("localStorage");
    expect(sessionSource).not.toContain("sessionStorage");
  });

  it("marks cookies httpOnly, secure and sameSite", () => {
    expect(sessionSource).toContain("httpOnly: true");
    expect(sessionSource).toContain("sameSite");
    expect(sessionSource).toContain("secure");
  });
});

describe("ApiError", () => {
  it("carries the machine-readable type slug", () => {
    const error = new ApiError({
      type: "not_visible",
      title: "No tienes acceso a esta información",
      status: 403,
    });
    expect(error.type).toBe("not_visible");
    expect(error.status).toBe(403);
  });

  it("exposes the Spanish title for display", () => {
    const error = new ApiError({
      type: "last_admin",
      title: "El hogar debe tener al menos un administrador",
      status: 409,
    });
    expect(error.message).toContain("administrador");
  });
});
