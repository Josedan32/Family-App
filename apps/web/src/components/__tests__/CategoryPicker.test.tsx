import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryPicker } from "../finance/CategoryPicker";

const categories = [
  { id: "c1", name: "Comida", kind: "expense", is_system: false },
  { id: "c2", name: "Transporte", kind: "expense", is_system: false },
  { id: "c3", name: "Aporte al hogar", kind: "expense", is_system: true },
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

  it("allows selecting more than one category in multi mode", () => {
    const onChange = vi.fn();
    render(
      <CategoryPicker categories={categories} mode="multi" value={["c1"]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Transporte"));

    expect(onChange).toHaveBeenCalledWith(["c1", "c2"]);
  });

  it("deselects a category when clicked again in multi mode", () => {
    const onChange = vi.fn();
    render(
      <CategoryPicker
        categories={categories}
        mode="multi"
        value={["c1", "c2"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText("Comida"));

    expect(onChange).toHaveBeenCalledWith(["c2"]);
  });
});
