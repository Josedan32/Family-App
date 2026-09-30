import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finanzas/tarjetas/c1",
}));

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { CardDetailPage } from "@/app/(app)/finanzas/tarjetas/CardDetailPage";
import { ApiError } from "@/lib/api/errors";
import type { CreditCardDetail, CreditCardStatement } from "@/lib/creditCards";

const statementSep: CreditCardStatement = {
  id: "s-sep",
  cycle_starts_on: "2026-08-16",
  cycle_ends_on: "2026-09-15",
  opening_balance_minor: 1_120_000,
  purchases_total_minor: 905_400,
  installments_due_minor: 180_000,
  interest_charged_minor: 36_900,
  payments_total_minor: 400_000,
  closing_balance_minor: 1_842_300,
  minimum_payment_minor: 184_230,
  payment_due_on: "2099-10-02",
};

const statementAug: CreditCardStatement = {
  ...statementSep,
  id: "s-aug",
  cycle_starts_on: "2026-07-16",
  cycle_ends_on: "2026-08-15",
  closing_balance_minor: 1_120_000,
  minimum_payment_minor: 112_000,
  payment_due_on: "2026-09-01",
};

const detail: CreditCardDetail = {
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
  current_cycle_balance_minor: 184_900,
  credit_used_ratio: 0.31,
  latest_statement: statementSep,
  purchases: [
    { id: "p-open", description: "Almacenes Éxito", category_id: null, amount_minor: 184_900,
      purchased_on: "2026-09-26", installments_total: null, installment_amount_minor: null, first_installment_on: null },
    { id: "p-billed", description: "Tiquetes Medellín", category_id: null, amount_minor: 640_000,
      purchased_on: "2026-09-03", installments_total: null, installment_amount_minor: null, first_installment_on: null },
    { id: "p-plan", description: "Colchón Spring", category_id: "cat-home", amount_minor: 1_080_000,
      purchased_on: "2026-06-12", installments_total: 6, installment_amount_minor: 180_000, first_installment_on: "2026-07-15" },
  ],
  payments: [{ id: "pay-billed", amount_minor: 400_000, paid_on: "2026-09-05", note: "Transferencia" }],
  statements: [statementAug, statementSep],
};

function respondWith(card: unknown, overrides?: (path: string, init?: RequestInit) => unknown) {
  clientFetch.mockImplementation((path: string, init?: RequestInit) => {
    const custom = overrides?.(path, init);
    if (custom !== undefined) return custom;
    if (path.startsWith("/categories")) return Promise.resolve([{ id: "cat-home", name: "Hogar" }]);
    return Promise.resolve(card);
  });
}

function rejectDeleteWith(type: string) {
  return (_path: string, init?: RequestInit) =>
    init?.method === "DELETE"
      ? Promise.reject(new ApiError({ type, title: "x", status: 409 }))
      : undefined;
}

function Wrapped({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  clientFetch.mockReset();
});

describe("CardDetailPage", () => {
  it("lists open-cycle purchases as deletable and billed ones as locked", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    expect(await screen.findByText("Ciclo abierto · sin facturar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar compra Almacenes Éxito" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar compra Tiquetes Medellín" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Facturada").length).toBeGreaterThan(0);
  });

  it("derives the installment number from the plan instead of reading a counter", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    expect(await screen.findByText(/Cuota 3 de 6/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Cuota 3 de 6" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
  });

  it("names the purchase category when it resolves", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    expect(await screen.findByText(/12 jun · Hogar/)).toBeInTheDocument();
    expect(screen.getByText("26 sep")).toBeInTheDocument();
  });

  it("switches between purchases, payments and statements", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    await screen.findByText("Colchón Spring");
    fireEvent.click(screen.getByRole("tab", { name: "Pagos" }));
    expect(screen.getByText(/Transferencia/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Extractos" }));
    expect(screen.getAllByText(/Pago mínimo/).length).toBeGreaterThan(0);
  });

  it("lists statements newest first", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    await screen.findByText("Colchón Spring");
    fireEvent.click(screen.getByRole("tab", { name: "Extractos" }));
    const text = screen.getByRole("tabpanel").textContent ?? "";
    expect(text).toContain("16 jul – 15 ago 2026");
    expect(text.indexOf("16 ago – 15 sep 2026")).toBeLessThan(text.indexOf("16 jul – 15 ago 2026"));
  });

  it("opens the billed sheet, and no toast, when the API answers 409", async () => {
    respondWith(detail, rejectDeleteWith("purchase_already_billed"));
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar compra Almacenes Éxito" }));
    expect(
      await screen.findByRole("alertdialog", { name: /ya está en un extracto cerrado/ }),
    ).toBeInTheDocument();
    expect(clientFetch).toHaveBeenCalledWith(
      expect.stringContaining("/purchases/p-open"),
      expect.objectContaining({ method: "DELETE" }),
      { quietOn: ["purchase_already_billed"] },
    );
  });

  it("uses the payment wording when a payment delete answers 409", async () => {
    const withOpenPayment = {
      ...detail,
      payments: [{ id: "pay-open", amount_minor: 90_000, paid_on: "2026-09-20", note: null }],
    };
    respondWith(withOpenPayment, rejectDeleteWith("payment_already_billed"));
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    await screen.findByText("Colchón Spring");
    fireEvent.click(screen.getByRole("tab", { name: "Pagos" }));
    fireEvent.click(screen.getByRole("button", { name: /Borrar pago/ }));
    expect(
      await screen.findByRole("alertdialog", { name: /Este pago ya está en un extracto cerrado/ }),
    ).toBeInTheDocument();
    expect(clientFetch).toHaveBeenCalledWith(
      expect.stringContaining("/payments/pay-open"),
      expect.objectContaining({ method: "DELETE" }),
      { quietOn: ["payment_already_billed"] },
    );
  });

  it("switches to statements from the billed sheet and closes it", async () => {
    respondWith(detail, rejectDeleteWith("purchase_already_billed"));
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar compra Almacenes Éxito" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ver extracto" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Extractos" })).toHaveAttribute("aria-selected", "true");
  });

  it("locks purchases dated on the cutoff and frees the next day", async () => {
    respondWith({
      ...detail,
      purchases: [
        { ...detail.purchases[0], id: "on-cutoff", description: "En el corte", purchased_on: "2026-09-15" },
        { ...detail.purchases[0], id: "after-cutoff", description: "Después del corte", purchased_on: "2026-09-16" },
      ],
    });
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    await screen.findByText("En el corte");
    expect(screen.queryByRole("button", { name: "Borrar compra En el corte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar compra Después del corte" })).toBeInTheDocument();
  });

  it("hides registering and deleting on a cancelled card but keeps statements", async () => {
    respondWith({ ...detail, status: "cancelled", outstanding_minor: 0 });
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    await screen.findByText(/Cancelada/);
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Borrar compra/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Extractos" }));
    expect(screen.getAllByText(/Pago mínimo/).length).toBeGreaterThan(0);
  });

  it("renders a card with no statements yet", async () => {
    respondWith({ ...detail, latest_statement: null, statements: [], outstanding_minor: 0 });
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    expect(await screen.findByText("Visa del día a día")).toBeInTheDocument();
    expect(screen.queryByText("Extracto más reciente")).not.toBeInTheDocument();
  });

  it("opens the purchase form from the sticky action", async () => {
    respondWith(detail);
    render(<Wrapped><CardDetailPage id="c1" /></Wrapped>);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByRole("dialog", { name: "Registrar compra" })).toBeInTheDocument();
  });

  it("shows a retryable error line when the card cannot be loaded", async () => {
    clientFetch.mockRejectedValue(new ApiError({ type: "not_found", title: "x", status: 404 }));
    render(<Wrapped><CardDetailPage id="nope" /></Wrapped>);
    expect(await screen.findByText("No pudimos cargar esta tarjeta.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
