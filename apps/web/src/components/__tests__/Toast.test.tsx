import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "../ui/Toast";
import { ToastStack } from "../ui/ToastStack";
import { pushToast, subscribeToast } from "@/lib/toast";

describe("Toast", () => {
  it("shows the message", () => {
    render(<Toast message="Sesión iniciada" type="success" onClose={() => {}} />);
    expect(screen.getByText("Sesión iniciada")).toBeInTheDocument();
  });

  it("uses an assertive role for danger and warning, polite otherwise", () => {
    const { rerender } = render(
      <Toast message="Algo falló" type="danger" onClose={() => {}} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<Toast message="Listo" type="success" onClose={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<Toast message="Adiós" type="info" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("toast bus", () => {
  it("notifies subscribers of a pushed toast", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);
    pushToast({ message: "Hola", type: "info" });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Hola", type: "info" }),
    );
    unsubscribe();
  });

  it("defaults to info when no type is given", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);
    pushToast({ message: "Sin tipo" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "info" }));
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);
    unsubscribe();
    pushToast({ message: "No debería llegar" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("ToastStack", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a pushed toast and removes it on close", () => {
    render(<ToastStack />);
    act(() => pushToast({ message: "Cuenta creada", type: "success" }));
    expect(screen.getByText("Cuenta creada")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(screen.queryByText("Cuenta creada")).toBeNull();
  });

  it("auto-dismisses after a timeout", () => {
    vi.useFakeTimers();
    render(<ToastStack />);
    act(() => pushToast({ message: "Se cierra solo", type: "info" }));
    expect(screen.getByText("Se cierra solo")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(7000));
    expect(screen.queryByText("Se cierra solo")).toBeNull();
  });
});
