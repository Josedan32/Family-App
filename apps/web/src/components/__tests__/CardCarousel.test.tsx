import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardCarousel } from "../creditCards/CardCarousel";
import { CARD_TILE_GAP, CARD_TILE_WIDTH } from "../creditCards/CardTile";
import type { CreditCard } from "@/lib/creditCards";

const STEP = CARD_TILE_WIDTH + CARD_TILE_GAP;

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

function scrollerTo(left: number) {
  const scroller = screen.getByRole("group", { name: "Card a" })
    .parentElement as HTMLElement;
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
  it("ignores intermediate scroll positions while animating to a tapped tile", () => {
    render(<Harness />);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({
      left: 2 * STEP,
      behavior: "smooth",
    });

    scrollerTo(STEP);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("follows the user again once the programmatic scroll arrives", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("group", { name: "Card c" }));
    scrollerTo(STEP);
    scrollerTo(2 * STEP);

    scrollerTo(STEP);
    expect(onSelect).toHaveBeenLastCalledWith("b");
    expect(scrollTo).toHaveBeenCalledTimes(1);
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
