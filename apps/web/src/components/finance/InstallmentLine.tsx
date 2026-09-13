const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS_ES[date.getUTCMonth()]}`;
}

interface Props {
  installments_paid: number | null;
  installments_total: number | null;
  next_installment_on: string | null;
}

/** Compact one-line installment indicator for a debt list row (as opposed to
 * the fuller `InstallmentSummary` block inside an expanded `DebtCard`). */
export function InstallmentLine({
  installments_paid,
  installments_total,
  next_installment_on,
}: Props) {
  if (installments_total === null) return null;

  if (next_installment_on === null) {
    return <span className="text-xs text-success">Plan completado</span>;
  }

  return (
    <span className="text-xs text-text-muted">
      {formatShortDate(next_installment_on)} · {installments_paid} de {installments_total}
    </span>
  );
}
