import { isReadableSignal, type BindingValue } from "@bindtty/vnode";

export function readNumberBindingValue(
  value: BindingValue<number> | undefined,
  fallback: number
): number {
  const nextValue = isReadableSignal<number>(value) ? value.get() : value;
  return typeof nextValue === "number" && Number.isFinite(nextValue)
    ? nextValue
    : fallback;
}

export function readBooleanBindingValue(
  value: BindingValue<boolean> | undefined,
  fallback: boolean
): boolean {
  const nextValue = isReadableSignal<boolean>(value) ? value.get() : value;
  return typeof nextValue === "boolean" ? nextValue : fallback;
}

export function omitUndefined(
  props: Record<string, BindingValue<unknown> | undefined>
): Record<string, BindingValue<unknown>> {
  const result: Record<string, BindingValue<unknown>> = {};

  for (const [name, value] of Object.entries(props)) {
    if (value !== undefined) {
      result[name] = value;
    }
  }

  return result;
}
