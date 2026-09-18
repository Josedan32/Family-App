import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReopenPeriodButton } from "../ReopenPeriodButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderButton(props: { isAdmin: boolean; status: string }) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ReopenPeriodButton periodId="p1" isAdmin={props.isAdmin} status={props.status} />
    </QueryClientProvider>,
  );
}

describe("ReopenPeriodButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    refresh.mockClear();
  });

  it("states the real rule when a non-admin views a closed period", () => {
    renderButton({ isAdmin: false, status: "closed" });

    const button = screen.getByRole("button", { name: "Reabrir periodo" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("Solo un administrador puede reabrir el periodo"),
    ).toBeInTheDocument();
  });

  it("states the real rule when the period is already open, even for an admin", () => {
    renderButton({ isAdmin: true, status: "open" });

    const button = screen.getByRole("button", { name: "Reabrir periodo" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Este periodo ya está abierto")).toBeInTheDocument();
  });

  it("lets an admin reopen a closed period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "p1", status: "open" })),
    );
    renderButton({ isAdmin: true, status: "closed" });

    const button = screen.getByRole("button", { name: "Reabrir periodo" });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
