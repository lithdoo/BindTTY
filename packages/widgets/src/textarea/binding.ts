import { isReadableSignal, type BindingValue } from "@bindtty/vnode";

export function readBindingValue<T>(value: BindingValue<T> | undefined): T | undefined {
  return isReadableSignal<T>(value) ? value.get() : value;
}

export function readBooleanBindingValue(value: BindingValue<boolean> | undefined, fallback: boolean): boolean {
  const nextValue = readBindingValue(value);
  return typeof nextValue === "boolean" ? nextValue : fallback;
}

export function readNumberBindingValue(value: BindingValue<number> | undefined, fallback: number): number {
  const nextValue = readBindingValue(value);
  return typeof nextValue === "number" && Number.isFinite(nextValue)
    ? nextValue
    : fallback;
}

export function readStringBindingValue(value: BindingValue<string>): string {
  return readBindingValue(value) ?? "";
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
