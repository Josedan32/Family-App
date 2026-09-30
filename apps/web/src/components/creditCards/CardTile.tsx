import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { daysBetween, formatDayMonth } from "@/lib/dates";
import { cardStanding, cardStandingLook, type CreditCard } from "@/lib/creditCards";

export function dueLine(card: CreditCard, today: string): string | null {
  const statement = card.latest_statement;
  if (!statement || card.outstanding_minor === 0) return null;
  const days = daysBetween(today, statement.payment_due_on);
  const date = formatDayMonth(statement.payment_due_on);
  if (days < 0) {
    const ago = -days;
    return `Fecha límite de pago ${date} · venció hace ${ago} ${ago === 1 ? "día" : "días"}`;
  }
  if (days === 0) return `Fecha límite de pago ${date} · hoy`;
  return `Fecha límite de pago ${date} · en ${days} ${days === 1 ? "día" : "días"}`;
}

export function CardTile({
  card,
  today,
  selected,
  onSelect,
}: {
  card: CreditCard;
  today: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const standing = cardStanding(card, today);
  const look = cardStandingLook(standing);
  const percent = Math.min(Math.round(card.credit_used_ratio * 100), 100);
  const line = dueLine(card, today);
  const cancelled = standing === "cancelled";

  return (
    <div
      role="group"
      aria-label={card.nickname}
      aria-current={selected ? "true" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={`flex min-h-[184px] w-[300px] flex-none snap-center flex-col gap-2.5 rounded-2xl border border-border border-l-4 p-3.5 pl-4 ${
        selected ? "ring-2 ring-brand " : ""
      }${
        cancelled ? "border-dashed text-text-muted" : ""
      }`}
      style={{ backgroundColor: look.tint, borderLeftColor: look.edge }}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{card.nickname}</span>
          <span className="truncate text-[0.8125rem] text-text-muted">{card.bank_label}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-[0.6875rem] font-bold ${look.pill}`}
        >
          <span aria-hidden="true">{look.glyph}</span>
          {look.label}
        </span>
      </div>

      <div className="flex flex-col">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted">
          Saldo pendiente
        </span>
        <MoneyDisplay
          amountMinor={card.outstanding_minor}
          currency={card.currency}
          className="text-[1.875rem] font-bold leading-tight tracking-tight"
        />
        {!cancelled && card.current_cycle_balance_minor > 0 ? (
          <span className="text-[0.8125rem] text-text-muted">
            + <MoneyDisplay amountMinor={card.current_cycle_balance_minor} currency={card.currency} /> en el
            ciclo abierto
          </span>
        ) : null}
      </div>

      {!cancelled ? (
        <div
          role="progressbar"
          aria-label={`Cupo usado ${percent}%`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: look.edge }} />
        </div>
      ) : null}

      {line ? <span className={`text-[0.8125rem] font-semibold ${look.text}`}>{line}</span> : null}
    </div>
  );
}
