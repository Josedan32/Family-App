import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BilledSheet } from "../creditCards/BilledSheet";

const statement = {
  id: "s1", cycle_starts_on: "2026-08-16", cycle_ends_on: "2026-09-15",
  opening_balance_minor: 0, purchases_total_minor: 0, installments_due_minor: 0,
  interest_charged_minor: 0, payments_total_minor: 0, closing_balance_minor: 0,
  minimum_payment_minor: 0, payment_due_on: "2026-10-02",
};

describe("BilledSheet", () => {
  it("explains a purchase locked in a closed statement", () => {
    render(
      <BilledSheet open kind="purchase" statement={statement} currency="COP"
        entry={{ title: "Tiquetes Medellín", detail: "3 sep · Viajes", amountMinor: 640_000 }}
        onClose={() => {}} onViewStatement={() => {}} />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Esta compra ya está en un extracto cerrado" });
    expect(dialog).toHaveTextContent("Tiquetes Medellín");
    expect(dialog).toHaveTextContent("Incluida en el extracto 16 ago – 15 sep 2026");
  });

  it("uses payment wording for a payment", () => {
    render(
      <BilledSheet open kind="payment" statement={statement} currency="COP"
        entry={{ title: "Pago", detail: "5 sep", amountMinor: 400_000 }}
        onClose={() => {}} onViewStatement={() => {}} />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Este pago ya está en un extracto cerrado" });
    expect(dialog).toHaveTextContent("no se puede borrar un pago");
  });

  it("offers to view the statement or dismiss", () => {
    const onView = vi.fn();
    const onClose = vi.fn();
    render(
      <BilledSheet open kind="purchase" statement={statement} currency="COP"
        entry={{ title: "x", detail: "y", amountMinor: 1 }} onClose={onClose} onViewStatement={onView} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver extracto" }));
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onView).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <BilledSheet open kind="purchase" statement={statement} currency="COP"
        entry={{ title: "x", detail: "y", amountMinor: 1 }} onClose={onClose} onViewStatement={() => {}} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog when opened", () => {
    render(
      <BilledSheet open kind="purchase" statement={statement} currency="COP"
        entry={{ title: "x", detail: "y", amountMinor: 1 }} onClose={() => {}} onViewStatement={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Entendido" })).toHaveFocus();
  });

  it("renders nothing while closed", () => {
    render(
      <BilledSheet open={false} kind="purchase" statement={statement} currency="COP"
        entry={{ title: "x", detail: "y", amountMinor: 1 }} onClose={() => {}} onViewStatement={() => {}} />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
