export type ToastType = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  message: string;
  type?: ToastType;
}

export interface ToastEvent extends ToastInput {
  id: string;
  type: ToastType;
}

type Listener = (toast: ToastEvent) => void;

/**
 * Plain pub-sub, not a React context: plain modules (clientFetch) need to
 * raise a toast without being inside a component tree.
 */
const listeners = new Set<Listener>();

export function pushToast({ message, type = "info" }: ToastInput): void {
  const event: ToastEvent = { id: crypto.randomUUID(), message, type };
  for (const listener of listeners) listener(event);
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
