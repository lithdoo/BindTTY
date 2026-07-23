import type { KeypressKey, TerminalKeyEvent } from "./types.js";

export function normalizeKeypressEvent(
  input: string | undefined,
  key: KeypressKey | undefined
): TerminalKeyEvent {
  const normalizedInput = input ?? "";
  return {
    kind: key?.name === "paste"
      ? "paste"
      : key?.name === "unknown"
        ? "unknown"
        : isReadlineTextInput(normalizedInput, key)
          ? "text"
          : "key",
    protocol: "readline",
    input: normalizedInput,
    name: key?.name,
    ctrl: Boolean(key?.ctrl),
    meta: Boolean(key?.meta),
    shift: Boolean(key?.shift),
    sequence: key?.sequence
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
