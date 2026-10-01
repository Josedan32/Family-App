"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { IconClose, IconLock } from "@/components/ui/Icons";
import { clientFetch } from "@/lib/api/client";
import {
  installmentsBilled,
  isBilled,
  type CreditCardDetail,
  type CreditCardPayment,
  type CreditCardPurchase,
} from "@/lib/creditCards";
import { formatDateRange, formatDayMonth, formatDayMonthYear } from "@/lib/dates";

import { StatementListItem } from "./StatementSummary";

interface ListProps {
  card: CreditCardDetail;
  today: string;
  editable: boolean;
  onDelete?: (id: string) => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted">
        {children}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function EntryRow({
  title,
  subtitle,
  amount,
  locked,
  lockedLabel,
  deleteLabel,
  onDelete,
  footer,
}: {
  title: string;
  subtitle: string;
  amount: ReactNode;
  locked: boolean;
  lockedLabel: string;
  deleteLabel: string;
  onDelete?: () => void;
  footer?: ReactNode;
}) {
  return (
    <li
      className={`flex flex-col gap-1.5 rounded-2xl py-2.5 ${
        locked
          ? "border border-border bg-surface-sunken px-3.5"
          : "border-[1.5px] border-dashed border-border bg-surface pl-3.5 pr-1"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.9375rem] font-semibold">{title}</span>
          <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>
        </div>
        {amount}
        {locked ? (
          <span
            aria-label={lockedLabel}
            role="img"
            className="flex w-7 flex-none justify-center text-text-muted"
          >
            <IconLock width={14} height={14} />
          </span>
        ) : onDelete ? (
          <button
            type="button"
            aria-label={deleteLabel}
            onClick={onDelete}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-muted active:bg-surface-sunken"
          >
            <IconClose />
          </button>
        ) : null}
      </div>
      {footer}
    </li>
  );
}

function useExpenseCategoryNames(): Map<string, string> {
  const categories = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => clientFetch<{ id: string; name: string }[]>("/categories?kind=expense"),
  });
  return new Map((categories.data ?? []).map((category) => [category.id, category.name]));
}

function PlanProgress({
  purchase,
  billed,
  currency,
}: {
  purchase: CreditCardPurchase;
  billed: number;
  currency: string;
}) {
  const total = purchase.installments_total ?? 0;
  const label = `Cuota ${billed} de ${total}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuenow={billed}
        aria-valuemax={total}
        className="mr-9 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full bg-brand" style={{ width: `${(billed / total) * 100}%` }} />
      </div>
      <span className="tabular text-xs text-text-muted">
        {billed > 0 ? label : `Sin cuotas facturadas de ${total}`} ·{" "}
        <MoneyDisplay amountMinor={purchase.installment_amount_minor ?? 0} currency={currency} />{" "}
        cada una
      </span>
    </div>
  );
}

export function PurchasesTab({ card, editable, onDelete }: ListProps) {
  const categoryNames = useExpenseCategoryNames();
  const latest = card.latest_statement;
  const open = card.purchases.filter((p) => !isBilled(p.purchased_on, latest));
  const billed = card.purchases.filter((p) => isBilled(p.purchased_on, latest));

  const row = (purchase: CreditCardPurchase, locked: boolean) => {
    const category = purchase.category_id ? categoryNames.get(purchase.category_id) : undefined;
    const parts = [
      formatDayMonth(purchase.purchased_on),
      category,
      purchase.installments_total ? `a ${purchase.installments_total} cuotas` : undefined,
    ].filter(Boolean);
    return (
      <EntryRow
        key={purchase.id}
        title={purchase.description}
        subtitle={parts.join(" · ")}
        amount={
          <MoneyDisplay
            amountMinor={purchase.amount_minor}
            currency={card.currency}
            className="text-[0.9375rem] font-bold text-text"
          />
        }
        locked={locked}
        lockedLabel="Facturada"
        deleteLabel={`Borrar compra ${purchase.description}`}
        onDelete={editable && onDelete ? () => onDelete(purchase.id) : undefined}
        footer={
          purchase.installments_total ? (
            <PlanProgress
              purchase={purchase}
              billed={installmentsBilled(purchase, latest)}
              currency={card.currency}
            />
          ) : undefined
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Ciclo abierto · sin facturar</SectionLabel>
      {open.length ? (
        <ul className="flex flex-col gap-2">{open.map((p) => row(p, false))}</ul>
      ) : (
        <p className="text-sm text-text-muted">Sin compras en el ciclo abierto.</p>
      )}
      {latest && billed.length ? (
        <>
          <SectionLabel>
            En el extracto {formatDateRange(latest.cycle_starts_on, latest.cycle_ends_on)}
          </SectionLabel>
          <ul className="flex flex-col gap-2">{billed.map((p) => row(p, true))}</ul>
        </>
      ) : null}
    </div>
  );
}

export function PaymentsTab({ card, editable, onDelete }: ListProps) {
  const latest = card.latest_statement;
  const open = card.payments.filter((p) => !isBilled(p.paid_on, latest));
  const billed = card.payments.filter((p) => isBilled(p.paid_on, latest));

  const row = (payment: CreditCardPayment, locked: boolean) => (
    <EntryRow
      key={payment.id}
      title="Pago"
      subtitle={[formatDayMonth(payment.paid_on), payment.note].filter(Boolean).join(" · ")}
      amount={
        <MoneyDisplay
          amountMinor={payment.amount_minor}
          currency={card.currency}
          className="text-[0.9375rem] font-bold text-success"
        />
      }
      locked={locked}
      lockedLabel="Facturado"
      deleteLabel={`Borrar pago del ${formatDayMonth(payment.paid_on)}`}
      onDelete={editable && onDelete ? () => onDelete(payment.id) : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Ciclo abierto · sin facturar</SectionLabel>
      {open.length ? (
        <ul className="flex flex-col gap-2">{open.map((p) => row(p, false))}</ul>
      ) : (
        <p className="text-sm text-text-muted">
          {latest
            ? `Aún no hay pagos después del corte. Fecha límite de pago: ${formatDayMonthYear(latest.payment_due_on)}.`
            : "Aún no hay pagos."}
        </p>
      )}
      {latest && billed.length ? (
        <>
          <SectionLabel>
            En el extracto {formatDateRange(latest.cycle_starts_on, latest.cycle_ends_on)}
          </SectionLabel>
          <ul className="flex flex-col gap-2">{billed.map((p) => row(p, true))}</ul>
        </>
      ) : null}
    </div>
  );
}

/** Every closed statement, newest first. */
export function StatementsTab({ card, today }: Pick<ListProps, "card" | "today">) {
  const newestFirst = [...card.statements].sort((a, b) =>
    b.cycle_ends_on.localeCompare(a.cycle_ends_on),
  );
  if (!newestFirst.length) {
    return <p className="text-sm text-text-muted">Aún no hay extractos cerrados.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {newestFirst.map((statement, index) => (
        <StatementListItem
          key={statement.id}
          statement={statement}
          currency={card.currency}
          today={today}
          latest={index === 0}
        />
      ))}
    </div>
  );
}
