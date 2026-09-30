"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  nearestTileIndex,
  snapCenterLeft,
  type CreditCard,
  type TileBox,
} from "@/lib/creditCards";

import { CARD_TILE_GAP, CardTile } from "./CardTile";

const ARRIVED_PX = 2;
const LOCK_FALLBACK_MS = 600;

function tileBoxes(scroller: HTMLElement): TileBox[] {
  return Array.from(scroller.children as HTMLCollectionOf<HTMLElement>).map(
    (tile) => ({ left: tile.offsetLeft, width: tile.offsetWidth }),
  );
}

/** Where a snap-centred tile rests, within what the browser can reach. */
function restingLeft(scroller: HTMLElement, index: number): number {
  const tile = tileBoxes(scroller)[index];
  if (!tile) return scroller.scrollLeft;
  const left = Math.max(snapCenterLeft(tile, scroller.clientWidth), 0);
  const reachable = scroller.scrollWidth - scroller.clientWidth;
  return reachable > 0 ? Math.min(left, reachable) : left;
}

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
  // The selection the member just made by swiping: the tile is already
  // where they put it, so scrolling again would fight the gesture.
  const selectedByScroll = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedIndex = Math.max(
    cards.findIndex((card) => card.id === selectedId),
    0,
  );

  const releaseLock = useCallback(() => {
    programmaticLeft.current = null;
    clearTimeout(fallback.current);
  }, []);

  const armFallback = useCallback(() => {
    clearTimeout(fallback.current);
    fallback.current = setTimeout(releaseLock, LOCK_FALLBACK_MS);
  }, [releaseLock]);

  // Tapping a tile (or a filter change) brings it to the centre.
  useEffect(() => {
    if (selectedByScroll.current === selectedId) {
      selectedByScroll.current = null;
      return;
    }
    const element = scroller.current;
    if (!element) return;
    const left = restingLeft(element, selectedIndex);
    if (Math.abs(element.scrollLeft - left) <= ARRIVED_PX) return;
    programmaticLeft.current = left;
    armFallback();
    element.scrollTo?.({ left, behavior: "smooth" });
  }, [selectedId, selectedIndex, armFallback]);

  useEffect(() => {
    const element = scroller.current;
    element?.addEventListener("scrollend", releaseLock);
    return () => {
      element?.removeEventListener("scrollend", releaseLock);
      clearTimeout(fallback.current);
    };
  }, [releaseLock]);

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          if (programmaticLeft.current !== null) {
            if (
              Math.abs(element.scrollLeft - programmaticLeft.current) <=
              ARRIVED_PX
            )
              releaseLock();
            else armFallback();
            return;
          }
          const card =
            cards[
              nearestTileIndex(
                tileBoxes(element),
                element.scrollLeft,
                element.clientWidth,
              )
            ];
          if (card && card.id !== selectedId) {
            selectedByScroll.current = card.id;
            onSelect(card.id);
          }
        }}
        style={{ gap: CARD_TILE_GAP }}
        className="relative -mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 md:-mx-6 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
