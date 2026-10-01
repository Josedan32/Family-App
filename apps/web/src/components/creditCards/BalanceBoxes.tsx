import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { IconLock } from "@/components/ui/Icons";
import { addDays, formatDayMonth, nextCutoffOn, todayLocal } from "@/lib/dates";
import { cardStanding, cardStandingLook, type CreditCard } from "@/lib/creditCards";

/** Solid, sunken and locked: this number was billed and will not move. */
export function OutstandingBox({ card, today }: { card: CreditCard; today: string }) {
  const statement = card.latest_statement;
  const look = cardStandingLook(cardStanding(card, today));
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3.5 px-4">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[0.8125rem] font-semibold">Saldo pendiente</span>
        {statement ? (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-text-muted">
            <IconLock width={11} height={11} />
            Facturado el {formatDayMonth(statement.cycle_ends_on)}
          </span>
        ) : null}
      </div>
      <MoneyDisplay
        amountMinor={card.outstanding_minor}
        currency={card.currency}
        className="text-2xl font-bold tracking-tight"
      />
      {statement && card.outstanding_minor > 0 ? (
        <span className="tabular text-[0.8125rem] text-text-muted">
          Pago mínimo{" "}
          <MoneyDisplay amountMinor={statement.minimum_payment_minor} currency={card.currency} /> ·{" "}
          <span className={`font-semibold ${look.text}`}>
            límite {formatDayMonth(statement.payment_due_on)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Dashed and grey: provisional, it changes with every purchase until the cutoff. */
export function OpenCycleBox({ card }: { card: CreditCard }) {
  const cutoff = card.latest_statement
    ? nextCutoffOn(card.statement_cutoff_day, addDays(card.latest_statement.cycle_ends_on, 1))
    : nextCutoffOn(card.statement_cutoff_day, todayLocal());
  return (
    <div className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-dashed border-border p-3.5 px-4">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[0.8125rem] font-semibold text-text-muted">
          Ciclo abierto · sin facturar
        </span>
        <span className="text-[0.6875rem] font-semibold text-text-muted">
          Corte {formatDayMonth(cutoff)}
        </span>
      </div>
      <MoneyDisplay
        amountMinor={card.current_cycle_balance_minor}
        currency={card.currency}
        className="text-xl font-semibold tracking-tight text-text-muted"
      />
      <span className="text-[0.8125rem] text-text-muted">
        Provisional. Cambia con cada compra hasta el corte.
      </span>
    </div>
  );
}
