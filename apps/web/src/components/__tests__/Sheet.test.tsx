import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sheet } from "../ui/Sheet";

/** Mirrors every real caller: an inline onClose, re-created on each render. */
function FormInSheet() {
  const [value, setValue] = useState("");
  return (
    <Sheet open onClose={() => undefined} title="Registrar aporte">
      <input aria-label="Monto" value={value} onChange={(e) => setValue(e.target.value)} />
    </Sheet>
  );
}

describe("Sheet", () => {
  it("moves focus into the dialog when it opens", () => {
    render(<FormInSheet />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("keeps focus on the field being typed in", () => {
    // Every keystroke re-renders the caller with a fresh onClose. If the sheet
    // re-focused itself on that, iOS dismissed the keyboard after one digit.
    render(<FormInSheet />);
    const input = screen.getByLabelText("Monto");
    input.focus();

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });

    expect(input).toHaveFocus();
    expect(input).toHaveValue("15");
  });

  it("closes on Escape with the latest onClose", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      <Sheet open onClose={first} title="Hoja">
        <p>contenido</p>
      </Sheet>,
    );
    rerender(
      <Sheet open onClose={latest} title="Hoja">
        <p>contenido</p>
      </Sheet>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
