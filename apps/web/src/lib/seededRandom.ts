/**
 * A tiny deterministic PRNG (mulberry32).
 *
 * The wheel's animation is driven by the cycle's stored seed so that every
 * member replays the *identical* spin — same rotations, same landing wobble —
 * whenever they open the page. `Math.random()` would give each viewer a
 * different show of the same result, which quietly undermines the point of
 * having a shared draw at all.
 *
 * It decides nothing. The outcome comes from the assignments the server
 * already stored; this only decides how the pointer gets there.
 */
export function seededRandom(seed: number): () => number {
  // Cycle seeds are 48-bit, and the shift below only keeps 32. Fold the high
  // bits down so two seeds that differ only above bit 32 still animate
  // differently.
  let a = (Math.floor(seed) ^ Math.floor(seed / 0x100000000)) >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number in [min, max], drawn from `next`. */
export function seededInt(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}
