import type { TerminalKeyEvent } from "@bindtty/terminal";

export function isTabKey(event: TerminalKeyEvent): boolean {
  return event.name === "tab" || event.input === "\t";
}

export function isShiftTabKey(event: TerminalKeyEvent): boolean {
  return isTabKey(event) && event.shift;
}

export function isEnterKey(event: TerminalKeyEvent): boolean {
  return event.name === "return" || event.name === "enter" || event.input === "\r";
}

export function isEscapeKey(event: TerminalKeyEvent): boolean {
  return event.name === "escape" || event.input === "\u001b";
}

export function isArrowKey(event: TerminalKeyEvent): boolean {
  return (
    event.name === "left" ||
    event.name === "right" ||
    event.name === "up" ||
    event.name === "down"
  );
}

export function isTextInputKey(event: TerminalKeyEvent): boolean {
  if (event.kind !== undefined) {
    return event.kind === "text";
  }

  return event.input.length > 0 && !event.ctrl && !event.meta && !event.name;
}
