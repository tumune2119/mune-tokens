"use client";

import confetti from "canvas-confetti";

const COLORS = ["#ffffff", "#e5e5e5", "#a3a3a3"];

/** A small white burst from both bottom corners (first export of a system). */
export function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = { particleCount: 60, spread: 70, startVelocity: 45, ticks: 220, colors: COLORS, scalar: 0.9 };
  confetti({ ...base, angle: 60, origin: { x: 0.15, y: 0.9 } });
  confetti({ ...base, angle: 120, origin: { x: 0.85, y: 0.9 } });
}
