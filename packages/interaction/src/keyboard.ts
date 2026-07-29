import type { SemanticInputEvent } from "@bindtty/input";

export function isTabKey(event: SemanticInputEvent): boolean {
  return event.kind === "key" && event.key === "tab";
}

export function isShiftTabKey(event: SemanticInputEvent): boolean {
  return isTabKey(event) &&
    event.kind === "key" &&
    event.modifiers.shift;
}

export function isEnterKey(event: SemanticInputEvent): boolean {
  return event.kind === "key" && event.key === "enter";
}

export function isEscapeKey(event: SemanticInputEvent): boolean {
  return event.kind === "key" && event.key === "escape";
}

export function isArrowKey(event: SemanticInputEvent): boolean {
  return (
    event.kind === "key" &&
    (
      event.key === "left" ||
      event.key === "right" ||
      event.key === "up" ||
      event.key === "down"
    )
  );
}

export function isTextInputKey(
  event: SemanticInputEvent
): event is Extract<SemanticInputEvent, { kind: "text" }> {
  return event.kind === "text";
}
