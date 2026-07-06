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
import {
  createDisabledDim,
  createFocusableBinding
} from "../shared/focusable.js";

export interface CheckboxStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
}

export interface CheckboxProps extends CheckboxStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  checked: BindingValue<boolean>;
  disabled?: BindingValue<boolean>;
  focusable?: BindingValue<boolean>;
  onChange?: (nextChecked: boolean) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export function Checkbox(props: CheckboxProps): Template {
  const marker = createMarkerValue(props.checked);

  return elementTemplate(
    "box",
    omitUndefined({
      id: props.id,
      focusable: createFocusableBinding(props.focusable, props.disabled),
      onKey: createCheckboxOnKey(props),
      onFocusChange: props.onFocusChange,
      border: false,
      padding: props.padding ?? 0,
      background: props.background
    }),
    elementTemplate(
      "hstack",
      { gap: 1 },
      [
        elementTemplate(
          "text",
          omitUndefined({
            value: marker,
            bold: props.bold
          })
        ),
        elementTemplate(
          "text",
          omitUndefined({
            value: props.label ?? "",
            color: props.color,
            dim: props.dim ?? createDisabledDim(props.disabled)
          })
        )
      ]
    )
  );
}

function createMarkerValue(
  checked: BindingValue<boolean>
): BindingValue<string> {
  if (isReadableSignal<boolean>(checked)) {
    return computed(() => (checked.get() ? "[x]" : "[ ]"));
  }

  return checked ? "[x]" : "[ ]";
}

function createCheckboxOnKey(
  props: CheckboxProps
): BindingValue<InteractionKeyBinding> {
  const disabled = props.disabled;
  const handler: InteractionKeyHandler = (event) => {
    if (!isEnterKey(event) && event.input !== " ") {
      return false;
    }

    props.onChange?.(!readChecked(props.checked));
    return true;
  };

  if (isReadableSignal<boolean>(disabled)) {
    return computed(() => (disabled.get() ? false : handler));
  }

  return disabled === true ? false : handler;
}

function readChecked(checked: BindingValue<boolean>): boolean {
  if (isReadableSignal<boolean>(checked)) {
    return checked.get();
  }

  return checked === true;
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
