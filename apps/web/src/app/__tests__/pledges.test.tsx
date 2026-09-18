import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CreatePeriodButton } from "../(app)/aportes/periodos/CreatePeriodButton";
import { EditPledgesButton } from "../(app)/aportes/[periodId]/EditPledgesButton";
import { pledgeStatus } from "../(app)/aportes/[periodId]/pledgeStatus";

const MEMBERS = [
  { id: "m1", display_name: "Daniel" },
  { id: "m2", display_name: "Papá" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function withClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe("CreatePeriodButton", () => {
  it("asks how much each member puts in", () => {
    withClient(<CreatePeriodButton currency="COP" members={MEMBERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear periodo" }));

    expect(screen.getByLabelText("Daniel")).toBeInTheDocument();
    expect(screen.getByLabelText("Papá")).toBeInTheDocument();
  });

  it("sends a pledge only for the members given an amount", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "p1" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    withClient(<CreatePeriodButton currency="COP" members={MEMBERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear periodo" }));

    fireEvent.change(screen.getByLabelText("Meta del hogar"), { target: { value: "2.000.000" } });
    fireEvent.change(screen.getByLabelText("Papá"), { target: { value: "1.200.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock).pledges).toEqual([
      { member_id: "m2", expected_amount_minor: 1_200_000 },
    ]);
  });
});

describe("EditPledgesButton", () => {
  const withPledges = [
    { member_id: "m1", display_name: "Daniel", pledged_minor: 800_000 },
    { member_id: "m2", display_name: "Papá", pledged_minor: 0 },
  ];

  it("opens with each member's current pledge", () => {
    withClient(<EditPledgesButton periodId="p1" currency="COP" members={withPledges} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar cuotas" }));

    expect(screen.getByLabelText("Daniel")).toHaveValue("800.000");
    expect(screen.getByLabelText("Papá")).toHaveValue("");
  });

  it("replaces the whole set with a PUT", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    withClient(<EditPledgesButton periodId="p1" currency="COP" members={withPledges} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar cuotas" }));

    fireEvent.change(screen.getByLabelText("Papá"), { target: { value: "500.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuotas" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/contribution-periods/p1/pledges");
    expect(init.method).toBe("PUT");
    expect(lastBody(fetchMock).pledges).toEqual([
      { member_id: "m1", expected_amount_minor: 800_000 },
      { member_id: "m2", expected_amount_minor: 500_000 },
    ]);
  });
});

describe("pledgeStatus", () => {
  it("does not call a member with no pledge done", () => {
    // Everyone read "Completó su cuota" before any pledge existed, since
    // 0 contributed is >= 0 pledged.
    expect(pledgeStatus(0, 0)).toBe("unassigned");
  });

  it("is done once the contribution covers the pledge", () => {
    expect(pledgeStatus(500_000, 500_000)).toBe("complete");
  });

  it("is pending while it does not", () => {
    expect(pledgeStatus(500_000, 100_000)).toBe("pending");
  });
});
