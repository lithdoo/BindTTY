import { computed } from "@bindtty/signal";
import { isReadableSignal, type BindingValue } from "@bindtty/vnode";
import { readBooleanBindingValue } from "./binding.js";

export function createWidgetFocusable(
  focusable: BindingValue<boolean> | undefined,
  disabled: BindingValue<boolean> | undefined,
  defaultFocusable = true
): BindingValue<boolean> {
  const base = focusable ?? defaultFocusable;

  if (disabled === undefined) {
    return base;
  }

  if (isReadableSignal<boolean>(disabled)) {
    if (isReadableSignal<boolean>(base)) {
      return computed(() => base.get() && !disabled.get());
    }

    if (base === false) {
      return false;
    }

    return computed(() => !disabled.get());
  }

  if (disabled === true) {
    return false;
  }

  return base;
}

export function isDisabledBinding(
  disabled: BindingValue<boolean> | undefined
): boolean {
  return readBooleanBindingValue(disabled, false);
}
