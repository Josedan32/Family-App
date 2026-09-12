export type Level = "private" | "summary" | "public";

const CONFIG: Record<Level, { label: string; icon: string; className: string }> = {
  private: { label: "Privado", icon: "🔒", className: "text-private" },
  summary: { label: "Resumen", icon: "◐", className: "text-text-muted" },
  public: { label: "Público", icon: "👁", className: "text-brand" },
};

export function VisibilityBadge({ level }: { level: Level }) {
  const { label, icon, className } = CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <span data-testid="visibility-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </span>
  );
}
