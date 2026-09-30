import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardTile } from "../creditCards/CardTile";
import { OpenCycleBox, OutstandingBox } from "../creditCards/BalanceBoxes";
import { StatementSummary } from "../creditCards/StatementSummary";
import type { CreditCard, CreditCardStatement } from "@/lib/creditCards";

const statement: CreditCardStatement = {
  id: "s1",
  cycle_starts_on: "2026-08-16",
  cycle_ends_on: "2026-09-15",
  opening_balance_minor: 1_120_000,
  purchases_total_minor: 905_400,
  installments_due_minor: 180_000,
  interest_charged_minor: 36_900,
  payments_total_minor: 400_000,
  closing_balance_minor: 1_842_300,
  minimum_payment_minor: 184_230,
  payment_due_on: "2026-10-02",
};
const card: CreditCard = {
  id: "c1",
  nickname: "Visa del día a día",
  bank_label: "Bancolombia",
  credit_limit_minor: 8_000_000,
  interest_rate_monthly_pct: 1.89,
  minimum_payment_pct: 10,
  minimum_payment_floor_minor: 50_000,
  statement_cutoff_day: 15,
  payment_due_days: 17,
  status: "active",
  currency: "COP",
  outstanding_minor: 1_842_300,
  current_cycle_balance_minor: 624_900,
  credit_used_ratio: 0.31,
  latest_statement: statement,
};

describe("CardTile", () => {
  it("shows both figures separately, with a word and glyph for the state", () => {
    render(<CardTile card={card} today="2026-09-30" />);
    expect(screen.getByText("Visa del día a día")).toBeInTheDocument();
    expect(screen.getByText(/Vence pronto/)).toBeInTheDocument();
    expect(screen.getByText("Saldo pendiente")).toBeInTheDocument();
    expect(screen.getByText(/1\.842\.300/)).toBeInTheDocument();
    expect(screen.getByText(/en el\s+ciclo abierto/)).toHaveTextContent(
      /\+ .*624\.900.* en el ciclo abierto/,
    );
    expect(screen.getByText(/Fecha límite de pago 2 oct · en 2 días/)).toBeInTheDocument();
  });

  it("draws the used-limit bar from the server ratio", () => {
    render(<CardTile card={card} today="2026-09-30" />);
    const bar = screen.getByRole("progressbar", { name: /Cupo usado/ });
    expect(bar).toHaveAttribute("aria-valuenow", "31");
  });

  it("caps the bar at 100 when the ratio exceeds the limit", () => {
    render(<CardTile card={{ ...card, credit_used_ratio: 1.4 }} today="2026-09-30" />);
    expect(screen.getByRole("progressbar", { name: /Cupo usado/ })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("says when the limit date has passed", () => {
    render(<CardTile card={card} today="2026-10-12" />);
    expect(screen.getByText(/En mora/)).toBeInTheDocument();
    expect(screen.getByText(/venció hace 10 días/)).toBeInTheDocument();
  });

  it("omits the open cycle line when nothing was bought", () => {
    render(<CardTile card={{ ...card, current_cycle_balance_minor: 0 }} today="2026-09-30" />);
    expect(screen.queryByText(/ciclo abierto/)).not.toBeInTheDocument();
  });

  it("renders a card with no statement without a limit date", () => {
    render(
      <CardTile
        card={{ ...card, latest_statement: null, outstanding_minor: 0 }}
        today="2026-09-30"
      />,
    );
    expect(screen.getByText(/Al día/)).toBeInTheDocument();
    expect(screen.queryByText(/Fecha límite/)).not.toBeInTheDocument();
  });

  it("marks a cancelled card", () => {
    render(<CardTile card={{ ...card, status: "cancelled", outstanding_minor: 0 }} today="2026-09-30" />);
    expect(screen.getByText(/Cancelada/)).toBeInTheDocument();
  });
});

describe("balance boxes", () => {
  it("locks the outstanding balance and names its statement", () => {
    render(<OutstandingBox card={card} today="2026-09-30" />);
    expect(screen.getByText(/Facturado el 15 sep/)).toBeInTheDocument();
    expect(screen.getByText(/Pago mínimo/)).toBeInTheDocument();
    expect(screen.getByText(/límite 2 oct/)).toBeInTheDocument();
  });

  it("marks the open cycle as provisional", () => {
    render(<OpenCycleBox card={card} />);
    expect(screen.getByText(/Ciclo abierto · sin facturar/)).toBeInTheDocument();
    expect(screen.getByText(/Corte 15 oct/)).toBeInTheDocument();
    expect(screen.getByText(/Provisional/)).toBeInTheDocument();
  });
});

describe("StatementSummary", () => {
  it("shows the whole account as a receipt", () => {
    render(<StatementSummary statement={statement} currency="COP" />);
    const box = screen.getByRole("group", { name: /Extracto/ });
    expect(within(box).getByText("16 ago – 15 sep 2026")).toBeInTheDocument();
    for (const label of ["Saldo anterior", "Compras", "Cuotas del mes", "Interés cobrado", "Pagos"]) {
      expect(within(box).getByText(label)).toBeInTheDocument();
    }
    expect(within(box).getByText("Saldo del extracto")).toBeInTheDocument();
    expect(within(box).getByText(/No se edita ni se recalcula/)).toBeInTheDocument();
  });
});
