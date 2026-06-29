import type { BindingValue, ReadableSignal } from "./types.js";

export function isReadableSignal<T = unknown>(
  value: BindingValue<T> | unknown
): value is ReadableSignal<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof value.get === "function" &&
    "subscribe" in value &&
    typeof value.subscribe === "function"
  );
}

export function resolveBindingValue<T>(value: BindingValue<T>): T {
  if (isReadableSignal<T>(value)) {
    return value.get();
  }

  return value;
}
