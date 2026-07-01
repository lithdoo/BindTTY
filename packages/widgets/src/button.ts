import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type Template
} from "@bindtty/vnode";
import {
  isEnterKey,
  type InteractionKeyBinding,
  type InteractionKeyHandler,
  type InteractionNodeFocusChangeEvent
} from "@bindtty/interaction";

export interface ButtonStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}

export interface ButtonProps extends ButtonStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  disabled?: BindingValue<boolean>;
  onPress?: () => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function Button(props: ButtonProps): Template {
  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      onKey: createButtonOnKey(props),
      onFocusChange: props.onFocusChange,
      border: props.border ?? true,
      padding: props.padding ?? 1,
      background: props.background,
      borderColor: props.borderColor
    }),
    elementTemplate(
      "text",
      omitUndefined({
        value: props.label ?? "",
        color: props.color,
        bold: props.bold,
        dim: props.dim ?? createDisabledDim(props.disabled)
      })
    )
  );
}

function createButtonOnKey(
  props: ButtonProps
): BindingValue<InteractionKeyBinding> {
  const disabled = props.disabled;
  const handler: InteractionKeyHandler = (event) => {
    if (isEnterKey(event) || event.input === " ") {
      props.onPress?.();
      return true;
    }

    return false;
  };

  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => (disabled.get() ? false : handler));
  }

  return disabled === true ? false : handler;
}

function createDisabledDim(
  disabled: BindingValue<boolean> | undefined
): BindingValue<boolean> | undefined {
  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => disabled.get());
  }

  return disabled === true ? true : undefined;
}

function omitUndefined(
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
