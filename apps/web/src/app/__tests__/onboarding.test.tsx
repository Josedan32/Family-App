import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import OnboardingPage from "../(onboarding)/onboarding/hogar/page";

describe("onboarding", () => {
  it("offers both creating and joining", () => {
    render(<OnboardingPage />);
    expect(screen.getByRole("tab", { name: "Crear hogar" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unirme con código" })).toBeInTheDocument();
  });

  it("uppercases the household code as it is typed", () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Unirme con código" }));
    const input = screen.getByLabelText("Código del hogar") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abcdefgh" } });
    expect(input.value).toBe("ABCDEFGH");
  });

  it("limits the code to eight characters", () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Unirme con código" }));
    expect(screen.getByLabelText("Código del hogar")).toHaveAttribute("maxLength", "8");
  });
});
