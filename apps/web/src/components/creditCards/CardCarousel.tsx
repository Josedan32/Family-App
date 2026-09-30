"use client";

import { useEffect, useRef } from "react";

import { selectedIndexFromScroll, type CreditCard } from "@/lib/creditCards";

import { CARD_TILE_GAP, CARD_TILE_WIDTH, CardTile } from "./CardTile";

const STEP = CARD_TILE_WIDTH + CARD_TILE_GAP;
const ARRIVED_PX = 2;
const LOCK_FALLBACK_MS = 600;

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
  // Where our own smooth scroll is heading. While set, scroll events are
  // the animation passing by, not the member choosing a tile.
  const programmaticLeft = useRef<number | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedIndex = Math.max(
    cards.findIndex((card) => card.id === selectedId),
    0,
  );

  function releaseLock() {
    programmaticLeft.current = null;
    clearTimeout(fallback.current);
  }

  // Tapping a tile (or a filter change) brings it to the centre.
  useEffect(() => {
    const element = scroller.current;
    const left = selectedIndex * STEP;
    if (!element || Math.abs(element.scrollLeft - left) <= ARRIVED_PX) return;
    programmaticLeft.current = left;
    clearTimeout(fallback.current);
    fallback.current = setTimeout(releaseLock, LOCK_FALLBACK_MS);
    element.scrollTo?.({ left, behavior: "smooth" });
  }, [selectedIndex]);

  useEffect(() => {
    const element = scroller.current;
    element?.addEventListener("scrollend", releaseLock);
    return () => {
      element?.removeEventListener("scrollend", releaseLock);
      clearTimeout(fallback.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={scroller}
        onScroll={(event) => {
          const { scrollLeft } = event.currentTarget;
          if (programmaticLeft.current !== null) {
            if (Math.abs(scrollLeft - programmaticLeft.current) <= ARRIVED_PX)
              releaseLock();
            return;
          }
          const index = selectedIndexFromScroll(
            scrollLeft,
            CARD_TILE_WIDTH,
            CARD_TILE_GAP,
            cards.length,
          );
          if (cards[index] && cards[index].id !== selectedId)
            onSelect(cards[index].id);
        }}
        style={{ gap: CARD_TILE_GAP }}
        className="-mx-5 flex snap-x snap-mandatory overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
