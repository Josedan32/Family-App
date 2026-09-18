import { describe, expect, it } from "vitest";

import {
  NO_DEBT_FILTERS,
  NO_TRANSACTION_FILTERS,
  debtCreditors,
  debtStatusCounts,
  filterDebts,
  filterGoals,
  filterTransactions,
  hiddenFilterCount,
} from "../financeFilters";

const tx = (over: Record<string, unknown>) => ({
  name: null as string | null,
  note: null as string | null,
  categories: [] as { id: string; name: string }[],
  payment_method: "cash",
  ...over,
});

describe("filterTransactions", () => {
  const items = [
    tx({ name: "Mercado D1", categories: [{ id: "c1", name: "Comida" }], payment_method: "nequi" }),
    tx({ name: "Cívica", categories: [{ id: "c2", name: "Transporte" }] }),
    tx({ name: null, note: "almuerzo con Caro", categories: [{ id: "c1", name: "Comida" }] }),
  ];

  it("returns everything with no filters", () => {
    expect(filterTransactions(items, NO_TRANSACTION_FILTERS)).toHaveLength(3);
  });

  it("searches name, note and category, ignoring case and accents", () => {
    const search = (query: string) =>
      filterTransactions(items, { ...NO_TRANSACTION_FILTERS, query }).length;
    expect(search("civica")).toBe(1);
    expect(search("CARO")).toBe(1);
    expect(search("comida")).toBe(2);
  });

  it("keeps a row when any of its categories is selected", () => {
    const kept = filterTransactions(items, { ...NO_TRANSACTION_FILTERS, categoryIds: ["c2"] });
    expect(kept.map((t) => t.name)).toEqual(["Cívica"]);
  });

  it("filters by payment method", () => {
    const kept = filterTransactions(items, { ...NO_TRANSACTION_FILTERS, methods: ["nequi"] });
    expect(kept.map((t) => t.name)).toEqual(["Mercado D1"]);
  });

  it("counts only the filters tucked away in the sheet", () => {
    expect(hiddenFilterCount({ query: "x", categoryIds: ["a", "b"], methods: ["nequi"] })).toBe(3);
  });
});

const debt = (over: Record<string, unknown>) => ({
  name: "Deuda",
  creditor_label: "Addi",
  outstanding_minor: 100_000,
  standing: "up_to_date",
  next_due_on: null as string | null,
  ...over,
});

describe("filterDebts", () => {
  const debts = [
    debt({
      name: "Nu",
      creditor_label: "Nu",
      outstanding_minor: 800_000,
      standing: "overdue",
      next_due_on: "2026-09-05",
    }),
    debt({
      name: "Addi Lego",
      outstanding_minor: 90_000,
      standing: "due_soon",
      next_due_on: "2026-09-20",
    }),
    debt({ name: "Celular", creditor_label: "Celular", outstanding_minor: 0, standing: "paid" }),
  ];

  it("splits by standing", () => {
    const names = (status: "active" | "overdue" | "paid") =>
      filterDebts(debts, { ...NO_DEBT_FILTERS, status }).map((d) => d.name);
    expect(names("active")).toEqual(["Nu", "Addi Lego"]);
    expect(names("overdue")).toEqual(["Nu"]);
    expect(names("paid")).toEqual(["Celular"]);
  });

  it("counts each status for the chips", () => {
    expect(debtStatusCounts(debts)).toEqual({ all: 3, active: 2, overdue: 1, paid: 1 });
  });

  it("filters by creditor", () => {
    const kept = filterDebts(debts, { ...NO_DEBT_FILTERS, creditors: ["Addi"] });
    expect(kept.map((d) => d.name)).toEqual(["Addi Lego"]);
  });

  it("lists each creditor once, alphabetically", () => {
    expect(debtCreditors(debts)).toEqual(["Addi", "Celular", "Nu"]);
  });

  it("sorts by the soonest due date, undated last", () => {
    expect(filterDebts(debts, NO_DEBT_FILTERS).map((d) => d.name)).toEqual([
      "Nu",
      "Addi Lego",
      "Celular",
    ]);
  });

  it("sorts by the largest outstanding balance", () => {
    const sorted = filterDebts(debts, { ...NO_DEBT_FILTERS, sort: "outstanding" });
    expect(sorted.map((d) => d.name)).toEqual(["Nu", "Addi Lego", "Celular"]);
  });
});

describe("filterGoals", () => {
  it("keeps only the chosen state", () => {
    const goals = [{ state: "usada" }, { state: "en_progreso" }];
    expect(filterGoals(goals, "usada")).toEqual([{ state: "usada" }]);
    expect(filterGoals(goals, "all")).toHaveLength(2);
  });
});
