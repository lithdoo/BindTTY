import { computed } from "@bindtty/signal";
import {
  elementTemplate,
  isReadableSignal,
  type BindingValue,
  type Template,
  type TemplateChildren
} from "@bindtty/vnode";
import {
  omitUndefined,
  readBooleanBindingValue,
  readNumberBindingValue
} from "../shared/binding.js";

export interface ProgressBarStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
}

export interface ProgressBarProps extends ProgressBarStyleProps {
  width: BindingValue<number>;
  value?: BindingValue<number>;
  max?: BindingValue<number>;
  label?: BindingValue<string | number>;
  showPercent?: BindingValue<boolean>;
  filledChar?: BindingValue<string>;
  emptyChar?: BindingValue<string>;
}

export function renderProgressBar(
  value: number,
  max: number,
  width: number,
  filledChar: string,
  emptyChar: string
): string {
  if (width <= 0 || max <= 0) {
    return "";
  }

  const ratio = Math.max(0, Math.min(1, value / max));
  const filledCols = Math.round(ratio * width);
  const emptyCols = width - filledCols;

  return filledChar.repeat(filledCols) + emptyChar.repeat(emptyCols);
}

export function renderProgressPercent(value: number, max: number): string {
  if (max <= 0) {
    return " 0%";
  }

  const ratio = Math.max(0, Math.min(1, value / max));
  return ` ${Math.round(ratio * 100)}%`;
}

export function ProgressBar(props: ProgressBarProps): Template {
  const barValue = createBarValue(props);
  const rowChildren: TemplateChildren[] = [
    elementTemplate(
      "box",
      { width: props.width },
      elementTemplate(
        "text",
        omitUndefined({
          value: barValue,
          color: props.color,
          bold: props.bold,
          dim: props.dim
        })
      )
    )
  ];

  if (props.label !== undefined) {
    rowChildren.unshift(
      elementTemplate(
        "text",
        omitUndefined({
          value: props.label,
          color: props.color,
          bold: props.bold,
          dim: props.dim
        })
      )
    );
  }

  if (shouldRenderPercent(props.showPercent)) {
    rowChildren.push(
      elementTemplate("text", {
        value: createPercentValue(props)
      })
    );
  }

  return elementTemplate(
    "box",
    omitUndefined({
      padding: props.padding ?? 0,
      background: props.background
    }),
    elementTemplate("hstack", { gap: 1 }, rowChildren)
  );
}

function createBarValue(props: ProgressBarProps): BindingValue<string> {
  const { value, max, width, filledChar, emptyChar } = props;

  if (
    isReadableSignal<number>(value) ||
    isReadableSignal<number>(max) ||
    isReadableSignal<number>(width) ||
    isReadableSignal<string>(filledChar) ||
    isReadableSignal<string>(emptyChar)
  ) {
    return computed(() =>
      renderProgressBar(
        readNumberBindingValue(value, 0),
        readNumberBindingValue(max, 100),
        readNumberBindingValue(width, 0),
        readStringBindingValue(filledChar, "█"),
        readStringBindingValue(emptyChar, "░")
      )
    );
  }

  return renderProgressBar(
    readNumberBindingValue(value, 0),
    readNumberBindingValue(max, 100),
    readNumberBindingValue(width, 0),
    readStringBindingValue(filledChar, "█"),
    readStringBindingValue(emptyChar, "░")
  );
}

function createPercentValue(props: ProgressBarProps): BindingValue<string> {
  const { value, max, showPercent } = props;

  if (
    isReadableSignal<number>(value) ||
    isReadableSignal<number>(max) ||
    isReadableSignal<boolean>(showPercent)
  ) {
    return computed(() => {
      if (!readBooleanBindingValue(showPercent, false)) {
        return "";
      }

      return renderProgressPercent(
        readNumberBindingValue(value, 0),
        readNumberBindingValue(max, 100)
      );
    });
  }

  return renderProgressPercent(
    readNumberBindingValue(value, 0),
    readNumberBindingValue(max, 100)
  );
}

function shouldRenderPercent(
  showPercent: BindingValue<boolean> | undefined
): boolean {
  if (isReadableSignal<boolean>(showPercent)) {
    return true;
  }

  return showPercent === true;
}

function readStringBindingValue(
  value: BindingValue<string> | undefined,
  fallback: string
): string {
  const nextValue = isReadableSignal<string>(value) ? value.get() : value;
  return typeof nextValue === "string" && nextValue.length > 0
    ? nextValue
    : fallback;
}
