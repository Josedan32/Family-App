import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../ui/Input";

describe("Input", () => {
  it("shows no error state by default", () => {
    render(<Input label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("marks the field invalid and shows the message when error is set", () => {
    render(<Input label="Nombre" error="Este campo es obligatorio" />);
    const input = screen.getByLabelText("Nombre");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Este campo es obligatorio");
  });

  it("still shows helperText when there is no error", () => {
    render(<Input label="Nombre" helperText="Como aparece en tu perfil" />);
    expect(screen.getByText("Como aparece en tu perfil")).toBeInTheDocument();
  });
});
