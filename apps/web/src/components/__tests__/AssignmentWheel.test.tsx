import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssignmentWheel, spinTarget } from "../chores/AssignmentWheel";
import type { Assignment, AssignmentMember } from "../chores/AssignmentRow";

const MEMBERS: AssignmentMember[] = [
  { id: "m1", display_name: "Daniel" },
  { id: "m2", display_name: "Papá" },
  { id: "m3", display_name: "Mamá" },
];

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    chore_id: "c1",
    chore_name: "Sacar la basura",
    chore_activities: [],
    chore_requirements: [],
    chore_expectation: null,
    member_id: "m2",
    member_name: "Papá",
    member_photo_url: null,
    due_on: "2026-10-01",
    status: "pending",
    effort_points: 1,
    completed_at: null,
    completed_by_member_id: null,
    ...over,
  };
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AssignmentWheel", () => {
  it("draws one segment per member, each labelled", () => {
    setReducedMotion(false);
    render(
      <AssignmentWheel assignments={[assignment()]} members={MEMBERS} seed={42} />,
    );

    for (const member of MEMBERS) {
      expect(screen.getByText(member.display_name)).toBeInTheDocument();
    }
  });

  it("skips straight to the result when the viewer prefers reduced motion", () => {
    // globals.css only zeroes CSS durations; a JS-driven rotation would still
    // run, so this has to be an explicit check.
    setReducedMotion(true);
    const onFinished = vi.fn();

    render(
      <AssignmentWheel
        assignments={[assignment()]}
        members={MEMBERS}
        seed={42}
        onFinished={onFinished}
      />,
    );

    expect(onFinished).toHaveBeenCalled();
    expect(screen.getByText("Sacar la basura → Papá")).toBeInTheDocument();
  });

  it("announces the result to assistive technology, not only on screen", () => {
    setReducedMotion(true);
    render(
      <AssignmentWheel assignments={[assignment()]} members={MEMBERS} seed={42} />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Sacar la basura le tocó a Papá");
  });

  it("offers a way out of the animation", () => {
    setReducedMotion(false);
    render(
      <AssignmentWheel
        assignments={[assignment(), assignment({ id: "a2" })]}
        members={MEMBERS}
        seed={42}
      />,
    );

    expect(screen.getByRole("button", { name: "Saltar" })).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to reveal", () => {
    setReducedMotion(false);
    const { container } = render(
      <AssignmentWheel assignments={[]} members={MEMBERS} seed={42} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the household has no assignable members", () => {
    setReducedMotion(false);
    const { container } = render(
      <AssignmentWheel assignments={[assignment()]} members={[]} seed={42} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("flickers through candidate names while spinning, like a draw in progress", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    render(
      <AssignmentWheel
        assignments={[
          assignment({ chore_name: "Sacar la basura", member_name: "Papá" }),
          assignment({ id: "a2", chore_name: "Lavar los platos", member_name: "Mamá" }),
        ]}
        members={MEMBERS}
        seed={42}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(20);
    });
    const reel = screen.getByTestId("wheel-reel");
    const firstFrame = reel.textContent;
    act(() => {
      vi.advanceTimersByTime(90);
    });
    const secondFrame = reel.textContent;

    // The reel is mid-spin, not silent and not already showing the outcome.
    expect(firstFrame).not.toBe("");
    expect(secondFrame).not.toBe("");
    vi.useRealTimers();
  });

});

describe("spinTarget", () => {
  const base = { step: 0, position: 1, count: 3, from: 0 };

  it("lands on the same angle for the same seed", () => {
    // This is what makes the replay honest: everyone sees the identical spin.
    expect(spinTarget({ ...base, seed: 4242 })).toBe(
      spinTarget({ ...base, seed: 4242 }),
    );
  });

  it("lands somewhere else for a different seed", () => {
    expect(spinTarget({ ...base, seed: 4242 })).not.toBe(
      spinTarget({ ...base, seed: 4243 })
    );
  });

  it("stops inside the chosen member's segment", () => {
    const count = 4;
    const segment = 360 / count;

    for (let position = 0; position < count; position += 1) {
      for (let step = 0; step < 12; step += 1) {
        const target = spinTarget({ seed: 99, step, position, count, from: 0 });
        // Undo the wheel's rotation to see which segment sits at the pointer.
        const atPointer = ((360 - (target % 360)) % 360 + 360) % 360;
        expect(Math.floor(atPointer / segment)).toBe(position);
      }
    }
  });

  it("always turns forwards, never backwards", () => {
    let from = 0;
    for (let step = 0; step < 10; step += 1) {
      const target = spinTarget({ seed: 7, step, position: step % 3, count: 3, from });
      expect(target).toBeGreaterThan(from);
      from = target;
    }
  });

  it("stays put when the member is not on the wheel", () => {
    expect(spinTarget({ ...base, seed: 1, position: -1, from: 720 })).toBe(720);
  });
});
