"use client";

import { useEffect, useState } from "react";

import { Toast } from "@/components/ui/Toast";
import { subscribeToast, type ToastEvent } from "@/lib/toast";

const AUTO_DISMISS_MS = 6000;

export function ToastStack() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((current) => [...current, toast]);
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full sm:w-auto">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
          />
        </div>
      ))}
    </div>
  );
}
