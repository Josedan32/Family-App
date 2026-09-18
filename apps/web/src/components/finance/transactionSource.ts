/** Where a derived ledger row comes from, and where to go to change it. */
export interface DerivedSource {
  pill: string;
  explanation: string;
  href: string;
  linkLabel: string;
}

const DERIVED: Record<string, DerivedSource> = {
  contribution: {
    pill: "Aporte",
    explanation: "Se registra automáticamente desde Aportes.",
    href: "/aportes",
    linkLabel: "Ver aportes ›",
  },
  household_expense: {
    pill: "Gasto del hogar",
    explanation: "Lo pagaste tú para el hogar. Se edita en Gastos del hogar.",
    href: "/hogar/gastos",
    linkLabel: "Ver gastos del hogar ›",
  },
};

const UNKNOWN: DerivedSource = {
  pill: "Automático",
  explanation: "Se registra automáticamente desde otro módulo.",
  href: "/finanzas",
  linkLabel: "Ver finanzas ›",
};

/** `null` for a manual row: only those are edited from the ledger itself. */
export function derivedSource(source: string): DerivedSource | null {
  if (source === "manual") return null;
  return DERIVED[source] ?? UNKNOWN;
}
