"use client";

const POINTS = Array.from({ length: 10 }, (_, index) => index + 1);

export function EffortSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange?: (points: number) => void;
  disabled?: boolean;
}) {
  function set(points: number) {
    if (disabled || !onChange) return;
    onChange(Math.min(10, Math.max(1, points)));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Esfuerzo
        </span>
        <span className="flex items-baseline gap-1 text-sm">
          <span className="tabular font-bold">{value}</span>
          <span className="font-medium text-text-muted">de 10</span>
        </span>
      </div>

      {/* Ten bars of increasing height, not a numeric field — the height IS
          the message, the number underneath only confirms it. */}
      <div
        role="slider"
        aria-label="Puntos de esfuerzo"
        aria-valuenow={value}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") set(value + 1);
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") set(value - 1);
        }}
        className="flex h-16 items-end gap-[5px]"
      >
        {POINTS.map((points) => (
          <button
            key={points}
            type="button"
            disabled={disabled}
            aria-label={`${points} punto${points === 1 ? "" : "s"} de esfuerzo`}
            onClick={() => set(points)}
            style={{ height: `${18 + points * 8.2}%` }}
            className={`flex-1 rounded-md ${
              points <= value ? "bg-brand" : "border border-border bg-surface-sunken"
            } ${disabled ? "" : "active:opacity-80"}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Rápida</span>
        <span>Pesada</span>
      </div>
    </div>
  );
}
