import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberCard, type DashboardMember } from "../finance/MemberCard";

const base: DashboardMember = {
  member_id: "1",
  display_name: "Papá",
  relationship: "Padre",
  photo_url: null,
  income: { level: "summary", total_minor: 3_000_000 },
  expenses: { level: "summary", total_minor: 2_100_000 },
  savings: { level: "full", total_minor: 900_000 },
  debts: { level: "private" },
  expenses_by_category: {
    level: "summary",
    rows: [{ category_name: "Comida", amount_minor: 500_000 }],
  },
};

describe("MemberCard", () => {
  it("shows a summary total", () => {
    render(<MemberCard member={base} currency="COP" />);
    // getByText's default normalizer collapses the NBSP formatMoney emits
    // into a regular space, so the query below uses a plain space.
    expect(screen.getByText("$ 3.000.000")).toBeInTheDocument();
  });

  it("renders PrivateBlock for a private module, with no figure", () => {
    render(<MemberCard member={base} currency="COP" />);
    const debts = screen.getByTestId("cell-debts");
    expect(debts).toHaveTextContent("Privado");
    expect(debts.textContent).not.toMatch(/\d/);
  });

  it("shows identity only when every module is private", () => {
    const hidden: DashboardMember = {
      ...base,
      income: { level: "private" },
      expenses: { level: "private" },
      savings: { level: "private" },
      debts: { level: "private" },
    };
    render(<MemberCard member={hidden} currency="COP" />);
    expect(screen.getByText("Papá")).toBeInTheDocument();
    expect(screen.getByText("Padre")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("never renders a zero in place of a private figure", () => {
    const hidden: DashboardMember = { ...base, income: { level: "private" } };
    render(<MemberCard member={hidden} currency="COP" />);
    expect(screen.getByTestId("cell-income")).not.toHaveTextContent("$0");
  });

  it("shows the per-category expense breakdown when visible", () => {
    render(<MemberCard member={base} currency="COP" />);
    expect(screen.getByText("Gastos personales por categoría")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
  });

  it("discloses that a multi-category expense can outsum the total", () => {
    render(<MemberCard member={base} currency="COP" />);
    expect(screen.getByText(/puede superar el total de Gastos/)).toBeInTheDocument();
  });

  it("omits the category breakdown when private", () => {
    const hidden: DashboardMember = {
      ...base,
      expenses_by_category: { level: "private" },
    };
    render(<MemberCard member={hidden} currency="COP" />);
    expect(screen.queryByText("Gastos personales por categoría")).toBeNull();
    expect(screen.queryByText(/puede superar el total de Gastos/)).toBeNull();
  });
});
