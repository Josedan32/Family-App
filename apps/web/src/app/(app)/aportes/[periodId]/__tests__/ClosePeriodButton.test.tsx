import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClosePeriodButton } from "../ClosePeriodButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderButton(props: { isAdmin: boolean; status: string }) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ClosePeriodButton periodId="p1" isAdmin={props.isAdmin} status={props.status} />
    </QueryClientProvider>,
  );
}

describe("ClosePeriodButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    refresh.mockClear();
  });

  it("states the real rule when a non-admin views an open period", () => {
    renderButton({ isAdmin: false, status: "open" });

    const button = screen.getByRole("button", { name: "Cerrar periodo" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("Solo un administrador puede cerrar el periodo"),
    ).toBeInTheDocument();
  });

  it("states the real rule when the period is already closed, even for an admin", () => {
    renderButton({ isAdmin: true, status: "closed" });

    const button = screen.getByRole("button", { name: "Cerrar periodo" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Este periodo ya está cerrado")).toBeInTheDocument();
  });

  it("lets an admin close an open period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "p1", status: "closed" })),
    );
    renderButton({ isAdmin: true, status: "open" });

    const button = screen.getByRole("button", { name: "Cerrar periodo" });
    expect(button).toBeEnabled();
    expect(screen.queryByText("Solo un administrador puede cerrar el periodo")).toBeNull();

    fireEvent.click(button);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
