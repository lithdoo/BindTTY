import type { KeypressKey, TerminalKeyEvent } from "./types.js";

export function normalizeKeypressEvent(
  input: string | undefined,
  key: KeypressKey | undefined
): TerminalKeyEvent {
  return {
    input: input ?? "",
    name: key?.name,
    ctrl: Boolean(key?.ctrl),
    meta: Boolean(key?.meta),
    shift: Boolean(key?.shift),
    sequence: key?.sequence
  };
}
