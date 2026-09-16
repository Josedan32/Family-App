import { formatMoney, formatSigned } from "@/lib/money";

type Kind = "income" | "expense" | "savings" | "debt";

interface Props {
  amountMinor: number;
  currency: string;
  kind?: Kind;
  className?: string;
}

const SIGNED_KINDS = new Set<Kind>(["income", "expense"]);

const TONE: Record<Kind, string> = {
  income: "text-income",
  expense: "text-expense",
  savings: "text-savings",
  debt: "text-debt",
};

export function MoneyDisplay({ amountMinor, currency, kind, className = "" }: Props) {
  const text =
    kind && SIGNED_KINDS.has(kind)
      ? formatSigned(amountMinor, currency, kind as "income" | "expense")
      : formatMoney(amountMinor, currency);
  // Color never carries meaning alone: the sign and the label also differ.
  const tone = kind ? TONE[kind] : "";
  return <span className={`tabular ${tone} ${className}`}>{text}</span>;
}
