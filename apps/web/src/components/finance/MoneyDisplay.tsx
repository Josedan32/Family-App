import { formatMoney, formatSigned } from "@/lib/money";

interface Props {
  amountMinor: number;
  currency: string;
  kind?: "income" | "expense";
  className?: string;
}

export function MoneyDisplay({ amountMinor, currency, kind, className = "" }: Props) {
  const text = kind
    ? formatSigned(amountMinor, currency, kind)
    : formatMoney(amountMinor, currency);
  // Color never carries meaning alone: the sign and the label also differ.
  const tone = kind === "income" ? "text-income" : kind === "expense" ? "text-expense" : "";
  return <span className={`tabular ${tone} ${className}`}>{text}</span>;
}
