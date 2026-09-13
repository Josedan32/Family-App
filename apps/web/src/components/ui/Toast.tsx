import { IconAlertCircle, IconAlertTriangle, IconCheckCircle, IconClose, IconInfo } from "@/components/ui/Icons";
import type { ToastType } from "@/lib/toast";

const CONFIG: Record<ToastType, { Icon: typeof IconInfo; className: string }> = {
  info: { Icon: IconInfo, className: "border-brand text-brand" },
  success: { Icon: IconCheckCircle, className: "border-success text-success" },
  warning: { Icon: IconAlertTriangle, className: "border-warning text-warning" },
  danger: { Icon: IconAlertCircle, className: "border-danger text-danger" },
};

export function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: ToastType;
  onClose: () => void;
}) {
  const { Icon, className } = CONFIG[type];
  const urgent = type === "danger" || type === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`flex w-full max-w-sm items-start gap-3 rounded-xl border-l-4 bg-surface p-3.5 shadow-lg ${className}`}
    >
      <span className="mt-0.5 flex-none">
        <Icon />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-text">{message}</p>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="flex-none text-text-muted"
      >
        <IconClose />
      </button>
    </div>
  );
}
