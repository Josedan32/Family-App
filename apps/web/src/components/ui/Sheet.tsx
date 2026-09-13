"use client";

import { useEffect, useRef } from "react";

import { IconClose } from "@/components/ui/Icons";

/** Full-screen on mobile, centred modal from md up (design-system.md §2). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 md:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-bg md:max-h-[90dvh] md:max-w-lg md:rounded-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[2rem] font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-text-muted">
            <IconClose />
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-5 pb-4">{children}</div>
      </div>
    </div>
  );
}
