"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { seededInt, seededRandom } from "@/lib/seededRandom";
import type { Assignment, AssignmentMember } from "./AssignmentRow";

/**
 * Reveals a draw that has already happened. It decides nothing.
 *
 * The assignments come from the server, where `generate_cycle` produced them by
 * balancing accumulated effort. This spins the pointer to the member who was
 * already chosen. Driving the animation from the cycle's stored seed means
 * every member sees the identical spin, whenever they open the page.
 *
 * If it ever disagrees with the list below it, the wheel is deciding and that
 * is a defect.
 */

const SPIN_MS = 1200;
const PAUSE_MS = 700;
const CENTER = 100;
const RADIUS = 88;
const LABEL_RADIUS = 58;

/** Point on the circle at `degrees` measured clockwise from 12 o'clock. */
function pointAt(degrees: number, radius: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)];
}

function segmentPath(from: number, to: number): string {
  const [x1, y1] = pointAt(from, RADIUS);
  const [x2, y2] = pointAt(to, RADIUS);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/** Three on-token fills, cycled. Colour is decoration here — every segment
 *  carries the member's name, so nothing depends on telling them apart. */
const FILLS = [
  { fill: "var(--brand)", text: "var(--brand-contrast)" },
  { fill: "var(--surface-sunken)", text: "var(--text)" },
  { fill: "var(--brand-tint)", text: "var(--brand)" },
];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Where the wheel must stop for `position` to sit under the pointer, given
 * where it is now.
 *
 * Pure and exported so the determinism that matters — same seed, same
 * landing — is tested directly rather than through DOM timing.
 */
export function spinTarget({
  seed,
  step,
  position,
  count,
  from,
}: {
  seed: number;
  step: number;
  position: number;
  count: number;
  from: number;
}): number {
  if (position < 0 || count <= 0) return from;

  const segment = 360 / count;
  // Offsetting by the step keeps consecutive spins from being identical while
  // staying a pure function of the cycle's seed.
  const next = seededRandom(seed + step * 7919);
  const turns = seededInt(next, 3, 5);
  const wobble = (next() - 0.5) * segment * 0.7;

  const middle = position * segment + segment / 2;
  const landing = (360 - (((middle + wobble) % 360) + 360) % 360) % 360;
  return from - (from % 360) + turns * 360 + landing;
}

export function AssignmentWheel({
  assignments,
  members,
  seed,
  onFinished,
}: {
  assignments: Assignment[];
  members: AssignmentMember[];
  seed: number;
  onFinished?: () => void;
}) {
  // Reduced motion: no spinning, straight to the outcome. The CSS kill switch
  // in globals.css only zeroes durations — a JS-driven rotation would still
  // run — so it is resolved here, at initialisation, rather than in an effect
  // that would flash the wheel before skipping it.
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(() => (prefersReducedMotion() ? assignments.length : 0));
  const [revealed, setRevealed] = useState<Assignment[]>(() =>
    prefersReducedMotion() ? assignments : [],
  );
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const segment = members.length > 0 ? 360 / members.length : 360;

  const targetRotation = useCallback(
    (memberId: string, step: number, from: number): number =>
      spinTarget({
        seed,
        step,
        position: members.findIndex((m) => m.id === memberId),
        count: members.length,
        from,
      }),
    [members, seed],
  );

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAnimating(false);
    setRevealed(assignments);
    setIndex(assignments.length);
  }, [assignments]);

  useEffect(() => {
    if (reduced || index >= assignments.length) return;
    const current = assignments[index];

    // Deferred to the next frame so the browser paints the wheel where it
    // currently is before the transition to its new angle begins — without
    // this the first spin has nothing to animate from.
    const frame = requestAnimationFrame(() => {
      setAnimating(true);
      setRotation((from) => targetRotation(current.member_id, index, from));

      const settle = setTimeout(() => {
        setRevealed((seen) => [...seen, current]);
        setAnimating(false);
        const advance = setTimeout(() => setIndex((i) => i + 1), PAUSE_MS);
        timers.current.push(advance);
      }, SPIN_MS);
      timers.current.push(settle);
    });

    return () => cancelAnimationFrame(frame);
  }, [index, assignments, reduced, targetRotation]);

  useEffect(() => {
    if (index >= assignments.length && assignments.length > 0) onFinished?.();
  }, [index, assignments.length, onFinished]);

  useEffect(() => {
    const pending = timers;
    return () => pending.current.forEach(clearTimeout);
  }, []);

  if (members.length === 0 || assignments.length === 0) return null;

  const current = assignments[Math.min(index, assignments.length - 1)];
  const settled = revealed[revealed.length - 1];
  const done = index >= assignments.length;

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex w-full items-baseline justify-between">
        <h2 className="text-base font-bold">El sorteo</h2>
        {!done ? (
          <button
            onClick={finish}
            className="min-h-11 px-1 text-sm font-semibold text-brand"
          >
            Saltar
          </button>
        ) : null}
      </div>

      <div className="relative">
        {/* Pointer, fixed at 12 o'clock. */}
        <svg
          viewBox="0 0 200 200"
          className="h-56 w-56"
          role="img"
          aria-label={`Ruleta de reparto con ${members.length} miembros`}
        >
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "100px 100px",
              transition: reduced ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          >
            {members.map((member, i) => {
              const from = i * segment;
              const to = from + segment;
              const [lx, ly] = pointAt(from + segment / 2, LABEL_RADIUS);
              const skin = FILLS[i % FILLS.length];
              return (
                <g key={member.id}>
                  <path
                    d={segmentPath(from, to)}
                    fill={skin.fill}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={lx}
                    y={ly}
                    fill={skin.text}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${from + segment / 2} ${lx} ${ly})`}
                  >
                    {member.display_name}
                  </text>
                </g>
              );
            })}
          </g>
          <circle cx={CENTER} cy={CENTER} r={14} fill="var(--surface)" stroke="var(--border)" />
        </svg>

        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[14px] border-x-transparent border-t-brand"
        />
      </div>

      <p className="min-h-6 text-center text-sm font-semibold">
        {animating ? current.chore_name : settled ? `${settled.chore_name} → ${settled.member_name}` : ""}
      </p>

      {/* The result is announced, not only shown. Without this the wheel is
          useless with a screen reader. */}
      <p role="status" aria-live="polite" className="sr-only">
        {settled ? `${settled.chore_name} le tocó a ${settled.member_name}` : ""}
      </p>

      <p className="text-center text-xs text-text-muted">
        La ruleta reparte equilibrando el esfuerzo de cada quien.
      </p>
    </section>
  );
}
