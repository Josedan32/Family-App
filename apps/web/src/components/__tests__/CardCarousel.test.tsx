import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardCarousel } from "../creditCards/CardCarousel";
import type { CreditCard } from "@/lib/creditCards";

function makeCard(id: string): CreditCard {
  return {
    id,
    nickname: `Card ${id}`,
    bank_label: "Bank",
    credit_limit_minor: 1_000_000,
    interest_rate_monthly_pct: 1.5,
    minimum_payment_pct: 10,
    minimum_payment_floor_minor: 50_000,
    statement_cutoff_day: 15,
    payment_due_days: 17,
    status: "active",
    currency: "COP",
    outstanding_minor: 0,
    current_cycle_balance_minor: 0,
    credit_used_ratio: 0.1,
    latest_statement: null,
  };
}

const cards = ["a", "b", "c"].map(makeCard);
const scrollTo = vi.fn();
const onSelect = vi.fn();

function Harness() {
  const [selectedId, setSelectedId] = useState("a");
  return (
    <CardCarousel
      cards={cards}
      today="2026-09-20"
      selectedId={selectedId}
      onSelect={(id) => {
        onSelect(id);
        setSelectedId(id);
      }}
    />
  );
}

const TILE_LEFTS = [16, 328, 640];
const TILE_WIDTH = 300;
const VIEWPORT = 360;
const restingLeft = (index: number) =>
  TILE_LEFTS[index] + TILE_WIDTH / 2 - VIEWPORT / 2;

function getScroller() {
  return screen.getByRole("group", { name: "Card a" })
    .parentElement as HTMLElement;
}

function mount() {
  const view = render(<Harness />);
  const scroller = getScroller();
  Object.defineProperty(scroller, "clientWidth", {
    value: VIEWPORT,
    configurable: true,
  });
  Array.from(scroller.children).forEach((tile, index) => {
    Object.defineProperty(tile, "offsetLeft", {
      value: TILE_LEFTS[index],
      configurable: true,
    });
    Object.defineProperty(tile, "offsetWidth", {
      value: TILE_WIDTH,
      configurable: true,
    });
  });
  return view;
}

function scrollerTo(left: number) {
  const scroller = getScroller();
  Object.defineProperty(scroller, "scrollLeft", {
    value: left,
    configurable: true,
  });
  fireEvent.scroll(scroller);
}

beforeEach(() => {
  HTMLElement.prototype.scrollTo =
    scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
});

afterEach(() => {
  cleanup();
  scrollTo.mockReset();
  onSelect.mockReset();
});

describe("CardCarousel", () => {
  it("selects a swiped-to tile without scrolling against the user", () => {
    mount();
    scrollerTo(restingLeft(1));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls a tapped non-adjacent tile to its snap-centre position", () => {
    mount();
    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({
      left: restingLeft(2),
      behavior: "smooth",
    });
  });

  it("ignores intermediate scroll positions while animating to a tapped tile", () => {
    mount();
    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    scrollerTo(restingLeft(1));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("follows the user again once the programmatic scroll arrives", () => {
    mount();
    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    scrollerTo(restingLeft(1));
    scrollerTo(restingLeft(2));

    scrollerTo(restingLeft(1));
    expect(onSelect).toHaveBeenLastCalledWith("b");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("follows the user again after scrollend", () => {
    mount();
    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    getScroller().dispatchEvent(new Event("scrollend"));

    scrollerTo(restingLeft(1));
    expect(onSelect).toHaveBeenLastCalledWith("b");
  });

  describe("lock fallback", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("extends the lock while scroll events keep arriving, then releases", () => {
      mount();
      fireEvent.click(screen.getByRole("group", { name: "Card c" }));

      vi.advanceTimersByTime(400);
      scrollerTo(restingLeft(1));
      vi.advanceTimersByTime(400);
      scrollerTo(restingLeft(0));
      expect(onSelect).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(700);
      scrollerTo(restingLeft(1));
      expect(onSelect).toHaveBeenLastCalledWith("b");
      expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it("clears its timer on unmount", () => {
      const { unmount } = mount();
      fireEvent.click(screen.getByRole("group", { name: "Card c" }));
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("bleeds by the app gutter so the page does not scroll sideways", () => {
    render(<Harness />);
    const scroller = screen.getByRole("group", { name: "Card a" })
      .parentElement as HTMLElement;
    const classes = scroller.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["-mx-4", "px-4", "md:-mx-6", "md:px-6"]),
    );
    expect(classes).not.toContain("-mx-5");
  });
});
