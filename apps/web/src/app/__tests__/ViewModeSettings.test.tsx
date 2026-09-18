import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ViewModeSettings } from "../(app)/ajustes/visualizacion/ViewModeSettings";
import { VIEW_MODE_STORAGE_KEY } from "@/lib/viewMode";

afterEach(() => window.localStorage.clear());

describe("ViewModeSettings", () => {
  it("offers cards and tables, with cards chosen by default", () => {
    render(<ViewModeSettings />);
    expect(screen.getByRole("radio", { name: /Tarjetas/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Tablas/ })).toHaveAttribute("aria-checked", "false");
  });

  it("switches this device to tables", () => {
    render(<ViewModeSettings />);
    fireEvent.click(screen.getByRole("radio", { name: /Tablas/ }));

    expect(screen.getByRole("radio", { name: /Tablas/ })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("table");
  });
});
