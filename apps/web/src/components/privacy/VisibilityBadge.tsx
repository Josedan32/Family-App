import { IconEye, IconEyeHalf, IconLock } from "@/components/ui/Icons";

export type Level = "private" | "summary" | "public";

const CONFIG: Record<
  Level,
  { label: string; Icon: typeof IconLock; className: string }
> = {
  private: { label: "Privado", Icon: IconLock, className: "text-private" },
  summary: { label: "Resumen", Icon: IconEyeHalf, className: "text-text-muted" },
  public: { label: "Público", Icon: IconEye, className: "text-brand" },
};

export function VisibilityBadge({ level }: { level: Level }) {
  const { label, Icon, className } = CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <Icon data-testid="visibility-icon" />
      {label}
    </span>
  );
}
