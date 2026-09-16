import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryPicker } from "../finance/CategoryPicker";

const categories = [
  { id: "c1", name: "Comida", kind: "expense", is_system: false },
  { id: "c2", name: "Aporte al hogar", kind: "expense", is_system: true },
];

describe("CategoryPicker", () => {
  it("offers user categories", () => {
    render(<CategoryPicker categories={categories} value="" onChange={() => {}} />);
    expect(screen.getByText("Comida")).toBeInTheDocument();
  });

  it("never offers a system category — it is written only by its owning service", () => {
    // "Aporte al hogar" is stamped by record_contribution itself. Letting
    // someone pick it here creates a look-alike transaction that never
    // becomes a real contribution (docs/superpowers backlog, Fase 2.5).
    render(<CategoryPicker categories={categories} value="" onChange={() => {}} />);
    expect(screen.queryByText("Aporte al hogar")).not.toBeInTheDocument();
  });
});
