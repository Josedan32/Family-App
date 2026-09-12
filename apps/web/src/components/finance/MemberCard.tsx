import { PrivateBlock } from "@/components/privacy/PrivateBlock";
import { Card } from "@/components/ui/Card";
import {
  IconArrowDown,
  IconArrowUp,
  IconCircleFilled,
  IconDiamondFilled,
  IconLock,
} from "@/components/ui/Icons";
import { MoneyDisplay } from "./MoneyDisplay";

export interface ModuleCell {
  /**
   * The RESOLVED level for this viewer — not the owner's setting. A "public"
   * setting resolves to "full" for every household viewer; "public" itself
   * never appears here (docs/visibility-rules.md line 42).
   */
  level: "full" | "summary" | "private";
  /** Absent — not null, not zero — when the level is private. */
  total_minor?: number;
}

export interface DashboardMember {
  member_id: string;
  display_name: string;
  relationship: string | null;
  photo_url: string | null;
  income: ModuleCell;
  expenses: ModuleCell;
  savings: ModuleCell;
  debts: ModuleCell;
}

const MODULES = ["income", "expenses", "savings", "debts"] as const;

const LABELS: Record<(typeof MODULES)[number], string> = {
  income: "Ingresos",
  expenses: "Gastos",
  savings: "Ahorros",
  debts: "Deudas",
};

const GLYPHS: Record<(typeof MODULES)[number], typeof IconArrowUp> = {
  income: IconArrowUp,
  expenses: IconArrowDown,
  savings: IconDiamondFilled,
  debts: IconCircleFilled,
};

// Color never carries meaning alone: the glyph and the word also differ.
const COLORS: Record<(typeof MODULES)[number], string> = {
  income: "text-income",
  expenses: "text-expense",
  savings: "text-savings",
  debts: "text-debt",
};

const VISIBILITY_LABEL: Record<ModuleCell["level"], string> = {
  full: "",
  summary: "Resumen",
  private: "Privado",
};

function Cell({
  name,
  cell,
  currency,
}: {
  name: (typeof MODULES)[number];
  cell: ModuleCell;
  currency: string;
}) {
  const isPrivate = cell.level === "private" || cell.total_minor === undefined;
  const Glyph = GLYPHS[name];
  return (
    <div
      data-testid={`cell-${name}`}
      className="flex flex-col gap-1 rounded-xl border border-border bg-surface-sunken p-2.5"
    >
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${COLORS[name]}`}>
        <Glyph />
        {LABELS[name]}
      </span>
      {isPrivate ? (
        <PrivateBlock />
      ) : (
        <>
          <MoneyDisplay amountMinor={cell.total_minor!} currency={currency} className="text-lg font-semibold" />
          {cell.level !== "full" ? (
            <span className="text-xs text-text-muted">{VISIBILITY_LABEL[cell.level]}</span>
          ) : null}
        </>
      )}
    </div>
  );
}

export function MemberCard({
  member,
  currency,
}: {
  member: DashboardMember;
  currency: string;
}) {
  const allPrivate = MODULES.every((name) => member[name].level === "private");

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-surface-sunken text-sm font-semibold text-text-muted"
        >
          {member.display_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{member.display_name}</p>
          {member.relationship ? (
            <p className="text-xs text-text-muted">{member.relationship}</p>
          ) : null}
        </div>
      </div>

      {allPrivate ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-sunken p-4">
          <span aria-hidden="true" className="text-lg text-private">
            <IconLock />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-private">Privado</p>
            <p className="text-xs text-text-muted">
              {member.display_name} decidió mantener sus cifras en privado. Siguen contando en
              los totales del hogar.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {MODULES.map((name) => (
            <Cell key={name} name={name} cell={member[name]} currency={currency} />
          ))}
        </div>
      )}
    </Card>
  );
}
