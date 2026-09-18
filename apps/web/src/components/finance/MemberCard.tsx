"use client";

import { useState } from "react";

import { PrivateBlock } from "@/components/privacy/PrivateBlock";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import {
  IconArrowDown,
  IconArrowUp,
  IconCircleFilled,
  IconDiamondFilled,
  IconLock,
} from "@/components/ui/Icons";
import { CategoryBreakdownList } from "./CategoryBreakdownList";
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

export interface CategoryAmount {
  category_name: string;
  amount_minor: number;
}

export interface CategoryBreakdown {
  /** Same resolved-level semantics as `ModuleCell`. */
  level: "full" | "summary" | "private";
  /** Absent — not null, not an empty list — when the level is private. */
  rows?: CategoryAmount[];
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
  expenses_by_category: CategoryBreakdown;
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
  const [showByPerson, setShowByPerson] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar displayName={member.display_name} photoUrl={member.photo_url} seed={member.member_id} />
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
        <>
          <div className="grid grid-cols-2 gap-3">
            {MODULES.map((name) => (
              <Cell key={name} name={name} cell={member[name]} currency={currency} />
            ))}
          </div>
          {member.expenses_by_category.level !== "private" ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={(event) => {
                  // MemberCard sits inside a Link to the member's page
                  // (dashboard) — without this the click bubbles up and
                  // navigates away instead of toggling the section.
                  event.preventDefault();
                  event.stopPropagation();
                  setShowByPerson((value) => !value);
                }}
                aria-expanded={showByPerson}
                className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-medium text-text-muted">
                  Gastos personales por categoría
                </span>
                <span aria-hidden="true" className="text-xs text-text-muted">
                  {showByPerson ? "▾" : "▸"}
                </span>
              </button>
              {showByPerson ? (
                <div className="mt-2 flex flex-col gap-2">
                  <CategoryBreakdownList
                    rows={member.expenses_by_category.rows ?? []}
                    currency={currency}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
