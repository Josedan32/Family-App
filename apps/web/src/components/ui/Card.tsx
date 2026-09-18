export function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`} style={style}>
      {children}
    </div>
  );
}
