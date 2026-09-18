import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "../not-found";

describe("not-found page", () => {
  it("speaks Spanish instead of Next's English default", () => {
    render(<NotFound />);
    expect(screen.getByText("Esta página no existe")).toBeInTheDocument();
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });

  it("offers a way back to the start", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});
