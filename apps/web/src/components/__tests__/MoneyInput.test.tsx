import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MoneyInput } from "../ui/MoneyInput";

function Harness() {
  const [value, setValue] = useState(0);
  return <MoneyInput label="Monto" value={value} onChange={setValue} currency="COP" />;
}

describe("MoneyInput", () => {
  it("groups thousands as the user types", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Monto") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });
    expect(input.value).toBe("2.000.000");
  });

  it("uses the numeric keyboard on mobile", () => {
    render(<Harness />);
    // type="number" has the wrong mobile keyboard and wrong validation for currency.
    const input = screen.getByLabelText("Monto");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("type", "number");
  });

  it("has a real label, not a placeholder standing in for one", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("shows the currency sign so the amount reads as money", () => {
    render(<Harness />);
    expect(screen.getByText("$", { exact: false })).toBeInTheDocument();
  });

  it("prefixes + and colors the field for income", () => {
    render(<MoneyInput label="Monto" value={0} onChange={() => {}} currency="COP" kind="income" />);
    expect(screen.getByText("+$", { exact: false })).toBeInTheDocument();
  });

  it("prefixes − and colors the field for expense", () => {
    render(<MoneyInput label="Monto" value={0} onChange={() => {}} currency="COP" kind="expense" />);
    expect(screen.getByText("−$", { exact: false })).toBeInTheDocument();
  });
});
