import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryPicker } from "../finance/CategoryPicker";

// "Comida" and "Transporte" are seeded defaults — is_system is true for them
// too (archive-only-never-delete), but they must stay pickable. Only the
// contribution category is excluded.
const categories = [
  { id: "c1", name: "Comida", kind: "expense", is_contribution_category: false },
  { id: "c2", name: "Transporte", kind: "expense", is_contribution_category: false },
  { id: "c3", name: "Aporte al hogar", kind: "expense", is_contribution_category: true },
];

describe("CategoryPicker", () => {
  it("offers user categories", () => {
    render(<CategoryPicker categories={categories} value="" onChange={() => {}} />);
    expect(screen.getByText("Comida")).toBeInTheDocument();
  });

  it("offers every seeded default category, not just user-created ones", () => {
    // Regression: these are marked is_system=true by the seed (archive-only
    // protection), which must NOT be confused with "unpickable".
    render(<CategoryPicker categories={categories} value="" onChange={() => {}} />);
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  it("never offers the contribution category — it is written only by record_contribution", () => {
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
