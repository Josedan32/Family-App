/** How each debt standing looks. The standing itself comes from the API. */
export type Standing = "paid" | "overdue" | "due_soon" | "up_to_date" | "cancelled";

interface StandingLook {
  label: string;
  /** Badge colors. */
  pill: string;
  /** Background wash for a card or a table row. */
  tint: string;
  /** Left edge accent for a card. */
  edge: string;
}

const wash = (token: string, percent: number) =>
  `color-mix(in srgb, var(${token}) ${percent}%, var(--surface))`;

export const STANDING_LOOK: Record<Standing, StandingLook> = {
  overdue: {
    label: "En mora",
    pill: "bg-danger/15 text-danger",
    tint: wash("--danger", 9),
    edge: "var(--danger)",
  },
  due_soon: {
    label: "Vence pronto",
    pill: "bg-warning/15 text-warning",
    tint: wash("--warning", 9),
    edge: "var(--warning)",
  },
  up_to_date: {
    label: "Al día",
    pill: "bg-surface-sunken text-text-muted",
    tint: "var(--surface)",
    edge: "var(--border)",
  },
  paid: {
    label: "Pagada",
    pill: "bg-success/15 text-success",
    tint: wash("--success", 8),
    edge: "var(--success)",
  },
  cancelled: {
    label: "Cancelada",
    pill: "bg-surface-sunken text-text-muted",
    tint: "var(--surface-sunken)",
    edge: "var(--border)",
  },
};

export function standingLook(standing: string): StandingLook {
  return STANDING_LOOK[standing as Standing] ?? STANDING_LOOK.up_to_date;
}

export const CREDITOR_LABEL: Record<string, string> = {
  addi: "Addi",
  credit_card: "Tarjeta de crédito",
  bank: "Banco",
  family: "Familia",
  other: "Otro",
};
