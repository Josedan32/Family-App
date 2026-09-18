/**
 * Pure filtering for the finance lists. It only selects and orders what the
 * API already sent — it never adds up money (totals come from the API).
 */

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// ------------------------------------------------------------ transactions

interface FilterableTransaction {
  name: string | null;
  note: string | null;
  categories: { id: string; name: string }[];
  payment_method: string;
}

export interface TransactionFilters {
  query: string;
  categoryIds: string[];
  methods: string[];
}

export const NO_TRANSACTION_FILTERS: TransactionFilters = {
  query: "",
  categoryIds: [],
  methods: [],
};

export function filterTransactions<T extends FilterableTransaction>(
  items: T[],
  filters: TransactionFilters,
): T[] {
  const query = normalize(filters.query.trim());
  return items.filter((item) => {
    if (query) {
      const haystack = normalize(
        [item.name ?? "", item.note ?? "", ...item.categories.map((c) => c.name)].join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    if (
      filters.categoryIds.length &&
      !item.categories.some((c) => filters.categoryIds.includes(c.id))
    ) {
      return false;
    }
    if (filters.methods.length && !filters.methods.includes(item.payment_method)) return false;
    return true;
  });
}

/** Filters tucked inside the sheet. The search box shows itself. */
export function hiddenFilterCount(filters: TransactionFilters): number {
  return filters.categoryIds.length + filters.methods.length;
}

// ------------------------------------------------------------------- debts

interface FilterableDebt {
  name: string;
  creditor_label: string;
  outstanding_minor: number;
  standing: string;
  next_due_on: string | null;
}

export type DebtStatusFilter = "all" | "active" | "overdue" | "paid";
export type DebtSort = "due" | "outstanding" | "name";

export interface DebtFilters {
  status: DebtStatusFilter;
  /** Who is owed, as the member wrote it ("Addi", "Nu"…). */
  creditors: string[];
  sort: DebtSort;
}

export const NO_DEBT_FILTERS: DebtFilters = { status: "all", creditors: [], sort: "due" };

function matchesStatus(debt: FilterableDebt, status: DebtStatusFilter): boolean {
  if (status === "active") return debt.standing !== "paid" && debt.standing !== "cancelled";
  if (status === "overdue") return debt.standing === "overdue";
  if (status === "paid") return debt.standing === "paid";
  return true;
}

export function filterDebts<T extends FilterableDebt>(debts: T[], filters: DebtFilters): T[] {
  const kept = debts.filter(
    (debt) =>
      matchesStatus(debt, filters.status) &&
      (!filters.creditors.length || filters.creditors.includes(debt.creditor_label)),
  );
  return [...kept].sort((a, b) => {
    if (filters.sort === "outstanding" && a.outstanding_minor !== b.outstanding_minor) {
      // A comparison, not a subtraction: no arithmetic on money here.
      return a.outstanding_minor > b.outstanding_minor ? -1 : 1;
    }
    if (filters.sort === "due") {
      // Soonest first; debts with no date to miss go last.
      if (a.next_due_on && b.next_due_on) return a.next_due_on.localeCompare(b.next_due_on);
      if (a.next_due_on) return -1;
      if (b.next_due_on) return 1;
    }
    return a.name.localeCompare(b.name, "es");
  });
}

/** Every creditor present, alphabetically, for the filter chips. */
export function debtCreditors(debts: FilterableDebt[]): string[] {
  return [...new Set(debts.map((d) => d.creditor_label))].sort((a, b) => a.localeCompare(b, "es"));
}

export function debtStatusCounts(debts: FilterableDebt[]): Record<DebtStatusFilter, number> {
  return {
    all: debts.length,
    active: debts.filter((d) => matchesStatus(d, "active")).length,
    overdue: debts.filter((d) => matchesStatus(d, "overdue")).length,
    paid: debts.filter((d) => matchesStatus(d, "paid")).length,
  };
}

// ------------------------------------------------------------------- goals

export type GoalStateFilter = "all" | "en_progreso" | "completado" | "usada";

export function filterGoals<T extends { state: string }>(goals: T[], state: GoalStateFilter): T[] {
  return state === "all" ? goals : goals.filter((goal) => goal.state === state);
}
