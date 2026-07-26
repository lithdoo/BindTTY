import type { TerminalKeyEvent } from "@bindtty/terminal";

export function isTabKey(event: TerminalKeyEvent): boolean {
  return event.kind === "key" && event.key === "tab";
}

export function isShiftTabKey(event: TerminalKeyEvent): boolean {
  return isTabKey(event) &&
    event.kind === "key" &&
    event.modifiers.shift;
}

export function isEnterKey(event: TerminalKeyEvent): boolean {
  return event.kind === "key" && event.key === "enter";
}

export function isEscapeKey(event: TerminalKeyEvent): boolean {
  return event.kind === "key" && event.key === "escape";
}

export function isArrowKey(event: TerminalKeyEvent): boolean {
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
  event: TerminalKeyEvent
): event is Extract<TerminalKeyEvent, { kind: "text" }> {
  return event.kind === "text";
}
