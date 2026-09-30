import { afterEach, describe, expect, it, vi } from "vitest";

import { subscribeToast, type ToastEvent } from "@/lib/toast";

import { clientFetch } from "../client";

function stubProblem(type: string) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type, title: "x", status: 409 }), { status: 409 }),
  ) as never;
}

function observeToasts() {
  const toasts: ToastEvent[] = [];
  const unsubscribe = subscribeToast((t) => toasts.push(t));
  return { toasts, unsubscribe };
}

describe("clientFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("toasts a failed request by default", async () => {
    stubProblem("purchase_already_billed");
    const { toasts, unsubscribe } = observeToasts();
    await expect(clientFetch("/x", { method: "DELETE" })).rejects.toMatchObject({
      type: "purchase_already_billed",
    });
    expect(toasts).toHaveLength(1);
    unsubscribe();
  });

  it("does not toast a problem type the caller handles itself", async () => {
    stubProblem("purchase_already_billed");
    const { toasts, unsubscribe } = observeToasts();
    await expect(
      clientFetch("/x", { method: "DELETE" }, { quietOn: ["purchase_already_billed"] }),
    ).rejects.toMatchObject({ type: "purchase_already_billed" });
    expect(toasts).toHaveLength(0);
    unsubscribe();
  });

  it("still toasts a problem type that is not listed in quietOn", async () => {
    stubProblem("something_else");
    const { toasts, unsubscribe } = observeToasts();
    await expect(
      clientFetch("/x", { method: "DELETE" }, { quietOn: ["purchase_already_billed"] }),
    ).rejects.toMatchObject({ type: "something_else" });
    expect(toasts).toHaveLength(1);
    unsubscribe();
  });
});
