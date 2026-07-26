import type { KeypressKey, TerminalKeyEvent } from "./types.js";

export function normalizeKeypressEvent(
  input: string | undefined,
  key: KeypressKey | undefined
): TerminalKeyEvent {
  const normalizedInput = input ?? "";
  const protocol = "readline" as const;
  const sequence = key?.sequence;

  if (key?.name === "paste") {
    return {
      kind: "paste",
      protocol,
      text: normalizedInput,
      sequence
    };
  }

  if (key?.name === "unknown") {
    return {
      kind: "unknown",
      protocol,
      raw: sequence ?? "",
      reason: "unrecognized-readline-key",
      sequence
    };
  }

  if (isReadlineTextInput(normalizedInput, key)) {
    return {
      kind: "text",
      protocol,
      text: normalizedInput,
      sequence
    };
  }

  return {
    kind: "key",
    protocol,
    key: key?.name === "return"
      ? "enter"
      : key?.name ?? normalizedInput,
    modifiers: {
      ctrl: key?.ctrl === true,
      alt: key?.meta === true,
      meta: false,
      shift: key?.shift === true
    },
    repeat: 1,
    sequence
  };
}

function isReadlineTextInput(
  input: string,
  key: KeypressKey | undefined
): boolean {
  return (
    input !== "" &&
    key?.ctrl !== true &&
    key?.meta !== true &&
    key?.name !== "return" &&
    key?.name !== "enter" &&
    key?.name !== "tab" &&
    key?.name !== "backspace" &&
    key?.name !== "delete"
  );
}
