import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../ui/Input";

describe("Input", () => {
  it("shows no error state by default", () => {
    render(<Input label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("renders the error message with alert role and marks the field invalid", () => {
    render(<Input label="Monto" error="El monto es obligatorio" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("El monto es obligatorio");
    expect(screen.getByLabelText("Monto")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Monto")).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
  });

  it("renders the warning message with alert role and a distinct color token", () => {
    render(<Input label="Fecha" warning="Esta fecha ya pasó" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Esta fecha ya pasó");
    expect(alert.className).toContain("text-warning");
    expect(screen.getByLabelText("Fecha")).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
    // Warning does not mark the field invalid — it is not an error.
    expect(screen.getByLabelText("Fecha")).not.toHaveAttribute("aria-invalid");
  });

  it("prefers error over warning when both are given", () => {
    render(<Input label="Monto" error="Obligatorio" warning="Revisa esto" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Obligatorio");
    expect(screen.queryByText("Revisa esto")).toBeNull();
  });

  it("falls back to helper text when there is no error or warning", () => {
    render(<Input label="Nombre" helperText="Como aparece en tu perfil" />);
    expect(screen.getByText("Como aparece en tu perfil")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
