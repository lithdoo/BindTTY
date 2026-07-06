import { computed } from "@bindtty/signal";
import { isReadableSignal, type BindingValue } from "@bindtty/vnode";

export function createFocusableBinding(
  focusable: BindingValue<boolean> | undefined,
  disabled: BindingValue<boolean> | undefined,
  defaultFocusable = true
): BindingValue<boolean> {
  const baseFocusable = focusable ?? defaultFocusable;

  if (disabled === undefined) {
    return baseFocusable;
  }

  if (isReadableSignal<boolean>(disabled)) {
    if (isReadableSignal<boolean>(baseFocusable)) {
      return computed(() => baseFocusable.get() && !disabled.get());
    }

    if (baseFocusable === false) {
      return false;
    }

    return computed(() => !disabled.get());
  }

  if (disabled === true) {
    return false;
  }

  return baseFocusable;
}

export function createDisabledDim(
  disabled: BindingValue<boolean> | undefined
): BindingValue<boolean> | undefined {
  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => disabled.get());
  }

  return disabled === true ? true : undefined;
}
