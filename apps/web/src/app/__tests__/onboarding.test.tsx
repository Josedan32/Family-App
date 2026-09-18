import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

import OnboardingPage from "../(onboarding)/onboarding/hogar/page";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("onboarding", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockClear();
    vi.stubGlobal("fetch", vi.fn());
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

  it("sends a visitor with no account to registro instead of showing 'session expired'", async () => {
    // A shared invite link is reachable by someone with no account and no
    // session. Trying to join with no Authorization header hits current_user
    // and comes back 401 "Tu sesión expiró" — misleading for someone who
    // never had a session. She should be routed to create an account instead.
    searchParams = new URLSearchParams({ code: "ABCD1234" });
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { type: "token_expired", title: "Tu sesión expiró", status: 401 }),
    );

    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Unirme" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/registro?code=ABCD1234"));
    expect(screen.queryByText("Tu sesión expiró")).not.toBeInTheDocument();
  });
});
