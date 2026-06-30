import type { LayoutRect } from "./types.js";

export function createZeroRect(): LayoutRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
}

export function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

export function toNonNegativeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}
