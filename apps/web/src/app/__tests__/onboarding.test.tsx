import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

import OnboardingPage from "../(onboarding)/onboarding/hogar/page";

describe("onboarding", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
  });

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

  it("prefills the code and switches to join mode from a shared invite link", () => {
    searchParams = new URLSearchParams({ code: "abcd1234" });
    render(<OnboardingPage />);

    expect(screen.getByRole("tab", { name: "Unirme con código", selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Código del hogar")).toHaveValue("ABCD1234");
  });
});
