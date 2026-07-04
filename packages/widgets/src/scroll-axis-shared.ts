import { isReadableSignal, type BindingValue } from "@bindtty/vnode";

export interface ScrollAxisStyleProps {
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}

export interface ScrollAxisAppliedState {
  hasLayout: boolean;
  applied: number;
  max: number;
  page: number;
  viewportSize: number;
  contentSize: number;
  userDetached: boolean;
}

export function createScrollAxisState(): ScrollAxisAppliedState {
  return {
    hasLayout: false,
    applied: 0,
    max: 0,
    page: 1,
    viewportSize: 1,
    contentSize: 1,
    userDetached: false
  };
}

export function resetScrollAxisState(state: ScrollAxisAppliedState): void {
  state.hasLayout = false;
  state.applied = 0;
  state.max = 0;
  state.page = 1;
  state.viewportSize = 1;
  state.contentSize = 1;
  state.userDetached = false;
}

export function computeScrollbarThumb(
  applied: number,
  max: number,
  viewportSize: number,
  contentSize: number
): { start: number; size: number } {
  if (max <= 0 || viewportSize <= 0 || contentSize <= 0) {
    return { start: 0, size: 0 };
  }

  const thumbSize = Math.max(
    1,
    Math.round((viewportSize * viewportSize) / contentSize)
  );
  const clampedSize = Math.min(thumbSize, viewportSize);
  const start = Math.round(
    (applied / max) * Math.max(0, viewportSize - clampedSize)
  );

  return { start, size: clampedSize };
}

export function renderScrollbarColumn(
  applied: number,
  max: number,
  viewportSize: number,
  contentSize: number
): string {
  if (max <= 0 || viewportSize <= 0) {
    return "";
  }

  const { start, size } = computeScrollbarThumb(
    applied,
    max,
    viewportSize,
    contentSize
  );
  const lines: string[] = [];

  for (let index = 0; index < viewportSize; index += 1) {
    lines.push(index >= start && index < start + size ? "█" : "│");
  }

  return lines.join("\n");
}

export function renderScrollbarRow(
  applied: number,
  max: number,
  viewportSize: number,
  contentSize: number
): string {
  if (max <= 0 || viewportSize <= 0) {
    return "";
  }

  const { start, size } = computeScrollbarThumb(
    applied,
    max,
    viewportSize,
    contentSize
  );
  const cells: string[] = [];

  for (let index = 0; index < viewportSize; index += 1) {
    cells.push(index >= start && index < start + size ? "█" : "─");
  }

  return cells.join("");
}

export interface StickToEndLayoutOptions {
  sticky: boolean;
  hadLayout: boolean;
  externalOffset: number;
  previousMax: number;
  maxIncreased: boolean;
  onOffsetChange?: (nextOffset: number) => void;
}

export function applyStickToEndOnLayout(
  state: ScrollAxisAppliedState,
  options: StickToEndLayoutOptions
): void {
  const {
    sticky,
    hadLayout,
    externalOffset,
    previousMax,
    maxIncreased,
    onOffsetChange
  } = options;

  if (
    sticky &&
    hadLayout &&
    externalOffset < state.max &&
    !(maxIncreased && externalOffset >= previousMax)
  ) {
    state.userDetached = true;
  }

  if (
    sticky &&
    !state.userDetached &&
    onOffsetChange &&
    state.applied < state.max
  ) {
    onOffsetChange(state.max);
  }
}

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
