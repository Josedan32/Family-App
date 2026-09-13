import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppError from "../(app)/error";
import { subscribeToast } from "@/lib/toast";

describe("(app) error boundary", () => {
  it("pushes a danger toast with the error message instead of a raw crash screen", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);

    render(<AppError error={new Error("No tienes acceso a esta información")} reset={() => {}} />);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No tienes acceso a esta información", type: "danger" }),
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    unsubscribe();
  });
});
