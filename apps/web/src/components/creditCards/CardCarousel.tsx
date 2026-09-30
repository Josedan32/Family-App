"use client";

import { useEffect, useRef } from "react";

import { selectedIndexFromScroll, type CreditCard } from "@/lib/creditCards";

import { CardTile } from "./CardTile";

const TILE_WIDTH = 300;
const GAP = 12;

export function CardCarousel({
  cards,
  today,
  selectedId,
  onSelect,
}: {
  cards: CreditCard[];
  today: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    cards.findIndex((card) => card.id === selectedId),
    0,
  );

  // Tapping a tile (or a filter change) brings it to the centre.
  useEffect(() => {
    scroller.current?.scrollTo?.({
      left: selectedIndex * (TILE_WIDTH + GAP),
      behavior: "smooth",
    });
  }, [selectedIndex]);

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={scroller}
        onScroll={(event) => {
          const index = selectedIndexFromScroll(
            event.currentTarget.scrollLeft,
            TILE_WIDTH,
            GAP,
            cards.length,
          );
          if (cards[index] && cards[index].id !== selectedId)
            onSelect(cards[index].id);
        }}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            today={today}
            selected={card.id === selectedId}
            onSelect={() => onSelect(card.id)}
          />
        ))}
      </div>
      {cards.length > 1 ? (
        <div aria-hidden="true" className="flex justify-center gap-[5px]">
          {cards.map((card, index) => (
            <span
              key={card.id}
              className={`h-1.5 rounded-full ${index === selectedIndex ? "w-[18px] bg-text" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
