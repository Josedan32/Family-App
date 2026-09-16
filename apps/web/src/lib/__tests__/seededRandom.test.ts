import { describe, expect, it } from "vitest";

import { seededInt, seededRandom } from "../seededRandom";

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    // This is the whole point: every member replays the identical spin.
    const a = seededRandom(4242);
    const b = seededRandom(4242);

    const first = Array.from({ length: 20 }, a);
    const second = Array.from({ length: 20 }, b);

    expect(first).toEqual(second);
  });

  it("gives a different sequence for a different seed", () => {
    const a = Array.from({ length: 20 }, seededRandom(4242));
    const b = Array.from({ length: 20 }, seededRandom(4243));

    expect(a).not.toEqual(b);
  });

  it("stays within [0, 1)", () => {
    const next = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("distinguishes seeds that differ only above bit 32", () => {
    // Cycle seeds are 48-bit; a naive `seed >>> 0` would collapse these two
    // into the same animation.
    const low = 12345;
    const high = 12345 + 0x100000000 * 7;

    expect(Array.from({ length: 5 }, seededRandom(low))).not.toEqual(
      Array.from({ length: 5 }, seededRandom(high)),
    );
  });

  it("does not drift over a long run", () => {
    // A poor PRNG can settle into a short cycle; 10k draws should still be
    // spread across the range.
    const next = seededRandom(99);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 10000; i += 1) buckets[Math.floor(next() * 4)] += 1;

    for (const count of buckets) expect(count).toBeGreaterThan(2000);
  });
});

describe("seededInt", () => {
  it("stays within the inclusive bounds", () => {
    const next = seededRandom(3);
    for (let i = 0; i < 500; i += 1) {
      const value = seededInt(next, 3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("can return both ends of the range", () => {
    const next = seededRandom(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(seededInt(next, 0, 2));

    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});
