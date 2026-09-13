import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { BottomTabBar, TABS } from "../layout/BottomTabBar";

describe("BottomTabBar", () => {
  it("renders the six Spanish destinations", () => {
    render(<BottomTabBar />);
    for (const label of ["Inicio", "Finanzas", "Aportes", "Tareas", "Hogar", "Ajustes"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("pads for the home indicator", () => {
    const { container } = render(<BottomTabBar />);
    // Without this the primary action sits under the iOS home indicator.
    expect(container.querySelector(".safe-bottom")).not.toBeNull();
  });

  it("marks the active destination for assistive tech", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Inicio").closest("a")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exports exactly six tabs", () => {
    expect(TABS).toHaveLength(6);
  });
});
