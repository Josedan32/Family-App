/** A new household is entirely empty screens. They are the first impression. */
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-4xl text-text-muted" aria-hidden="true">
        {icon}
      </span>
      <p className="text-text-muted">{message}</p>
      {action}
    </div>
  );
}
