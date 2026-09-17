import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../ui/Button";

describe("Button", () => {
  it("renders children without extra markup when not disabled", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows disabledReason as always-visible inline text when disabled", () => {
    render(
      <Button disabled disabledReason="Cierra el ciclo actual primero">
        Registrar aporte
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Registrar aporte" });
    expect(button).toBeDisabled();

    const reason = screen.getByRole("alert");
    expect(reason).toHaveTextContent("Cierra el ciclo actual primero");
    expect(button).toHaveAttribute("aria-describedby", reason.id);
  });

  it("does not render disabledReason text when the button is enabled", () => {
    render(
      <Button disabledReason="Nunca se debería ver">Registrar aporte</Button>,
    );
    expect(screen.queryByText("Nunca se debería ver")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not render extra markup when disabled without a reason", () => {
    render(<Button disabled>Registrar aporte</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
