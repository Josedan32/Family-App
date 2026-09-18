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

  it("never offers any reserved category the API writes itself", () => {
    render(
      <CategoryPicker
        categories={[
          ...categories,
          {
            id: "c4",
            name: "Retiro de ahorro",
            kind: "income",
            is_contribution_category: false,
            is_reserved: true,
          },
        ]}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("Retiro de ahorro")).not.toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
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

describe("CategoryPicker with a long category list", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    name: `Categoría ${i}`,
    kind: "expense",
    is_contribution_category: false,
  }));

  it("collapses past the fold with a 'ver más' chip", () => {
    render(<CategoryPicker categories={many} value="" onChange={() => {}} />);
    expect(screen.getByText("Categoría 0")).toBeInTheDocument();
    expect(screen.queryByText("Categoría 11")).not.toBeInTheDocument();
    expect(screen.getByText("+4 más")).toBeInTheDocument();
  });

  it("expands to show every category on demand", () => {
    render(<CategoryPicker categories={many} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByText("+4 más"));
    expect(screen.getByText("Categoría 11")).toBeInTheDocument();
  });

  it("never hides an already-selected category behind the fold", () => {
    render(<CategoryPicker categories={many} value="c11" onChange={() => {}} />);
    expect(screen.getByText("Categoría 11")).toBeInTheDocument();
  });
});
