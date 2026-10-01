import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hogar/miembros/m1/tarjetas",
}));

import {
  MemberCards,
  toMemberCardsState,
} from "@/app/(app)/hogar/miembros/[id]/tarjetas/MemberCards";
import type { CreditCard } from "@/lib/creditCards";

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
  latest_statement: {
    id: "s1",
    cycle_starts_on: "2026-08-16",
    cycle_ends_on: "2026-09-15",
    opening_balance_minor: 0,
    purchases_total_minor: 0,
    installments_due_minor: 0,
    interest_charged_minor: 0,
    payments_total_minor: 0,
    closing_balance_minor: 1_842_300,
    minimum_payment_minor: 184_230,
    payment_due_on: "2026-10-02",
  },
};

afterEach(cleanup);

describe("MemberCards", () => {
  it("public: shows tiles and the latest statement, with no write actions", () => {
    render(
      <MemberCards state="detail" memberId="m1" memberName="Mamá" cards={[card]} today="2026-09-30" />,
    );
    expect(screen.getByText("Público")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Visa del día a día" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Extracto 16 ago – 15 sep 2026/ })).toBeInTheDocument();
    expect(screen.getByText(/Solo lectura. Mamá comparte esta sección./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar|Nueva|Borrar/ })).not.toBeInTheDocument();
  });

  it("public: links only back to the member profile, never to the owner's card page", () => {
    render(
      <MemberCards state="detail" memberId="m1" memberName="Mamá" cards={[card]} today="2026-09-30" />,
    );
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/hogar/miembros/m1"]);
  });

  it("summary: only the total, no cards, purchases, payments or statements", () => {
    render(
      <MemberCards
        state="summary"
        memberId="m2"
        memberName="Papá"
        summary={{ total_outstanding_minor: 3_400_000, currency: "COP" }}
      />,
    );
    expect(screen.getByText("Resumen")).toBeInTheDocument();
    expect(screen.getByText(/3\.400\.000/)).toBeInTheDocument();
    expect(
      screen.getByText(/Papá comparte solo el total. No ves tarjetas, compras, pagos ni extractos./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("private: a locked panel that does not say how many cards exist", () => {
    render(<MemberCards state="private" memberId="m3" memberName="Hermano" />);
    // The badge and the panel heading both say it.
    expect(screen.getAllByText("Privado")).toHaveLength(2);
    expect(screen.getByText("Hermano no comparte esta sección.")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ tarjeta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/decidió no compartir/)).not.toBeInTheDocument();
  });

  it("public with no cards says so plainly", () => {
    render(
      <MemberCards state="detail" memberId="m1" memberName="Mamá" cards={[]} today="2026-09-30" />,
    );
    expect(screen.getByText("Mamá no tiene tarjetas registradas.")).toBeInTheDocument();
  });
});

describe("toMemberCardsState", () => {
  it("maps a denial to private", () => {
    expect(toMemberCardsState(null)).toEqual({ state: "private" });
  });

  it("maps a body with a total to summary", () => {
    const summary = { total_outstanding_minor: 10, currency: "COP" };
    expect(toMemberCardsState(summary)).toEqual({ state: "summary", summary });
  });

  it("maps an array to detail, even an empty one", () => {
    expect(toMemberCardsState([])).toEqual({ state: "detail", cards: [] });
    expect(toMemberCardsState([card])).toEqual({ state: "detail", cards: [card] });
  });
});
