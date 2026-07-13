import { keyEvent, type InputEvent } from "./events.js";

export interface FixedKeymapEntry {
  name: string;
  input?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequences: readonly string[];
}

export interface ReverseKeymap {
  bySequence: Map<string, InputEvent>;
}

export const defaultFixedKeymap: readonly FixedKeymapEntry[] = [
  { name: "return", input: "\r", sequences: ["\r", "\n"] },
  { name: "backspace", input: "", sequences: ["\x7f", "\b"] },
  { name: "tab", input: "", sequences: ["\t"] },
  { name: "c", input: "c", ctrl: true, sequences: ["\x03"] },
  { name: "up", input: "", sequences: ["\x1b[A", "\x1bOA", "\xe0H"] },
  { name: "down", input: "", sequences: ["\x1b[B", "\x1bOB", "\xe0P"] },
  { name: "right", input: "", sequences: ["\x1b[C", "\x1bOC", "\xe0M"] },
  { name: "left", input: "", sequences: ["\x1b[D", "\x1bOD", "\xe0K"] },
  { name: "home", input: "", sequences: ["\x1b[H", "\x1bOH", "\x1b[1~", "\x1b[7~", "\xe0G"] },
  { name: "end", input: "", sequences: ["\x1b[F", "\x1bOF", "\x1b[4~", "\x1b[8~", "\xe0O"] },
  { name: "insert", input: "", sequences: ["\x1b[2~"] },
  { name: "delete", input: "", sequences: ["\x1b[3~"] },
  { name: "pageup", input: "", sequences: ["\x1b[5~", "\x00I"] },
  { name: "pagedown", input: "", sequences: ["\x1b[6~", "\x00Q"] },
  { name: "f1", input: "", sequences: ["\x1bOP", "\x1b[11~", "\x00;"] },
  { name: "f2", input: "", sequences: ["\x1bOQ", "\x1b[12~", "\x00<"] },
  { name: "f3", input: "", sequences: ["\x1bOR", "\x1b[13~", "\x00="] },
  { name: "f4", input: "", sequences: ["\x1bOS", "\x1b[14~", "\x00>"] },
  { name: "f5", input: "", sequences: ["\x1b[15~", "\x00?"] },
  { name: "f6", input: "", sequences: ["\x1b[17~", "\x00@"] },
  { name: "f7", input: "", sequences: ["\x1b[18~", "\x00A"] },
  { name: "f8", input: "", sequences: ["\x1b[19~", "\x00B"] },
  { name: "f9", input: "", sequences: ["\x1b[20~", "\x00C"] },
  { name: "f10", input: "", sequences: ["\x1b[21~", "\x00D"] },
  { name: "f11", input: "", sequences: ["\x1b[23~", "\xe0\x85", "\x00\x85"] },
  { name: "f12", input: "", sequences: ["\x1b[24~", "\xe0\x86", "\x00\x86"] },
  { name: "up", input: "", shift: true, sequences: ["\x1b[1;2A"] },
  { name: "down", input: "", shift: true, sequences: ["\x1b[1;2B"] },
  { name: "right", input: "", shift: true, sequences: ["\x1b[1;2C"] },
  { name: "left", input: "", shift: true, sequences: ["\x1b[1;2D"] },
  { name: "up", input: "", meta: true, sequences: ["\x1b[1;3A"] },
  { name: "down", input: "", meta: true, sequences: ["\x1b[1;3B"] },
  { name: "right", input: "", meta: true, sequences: ["\x1b[1;3C"] },
  { name: "left", input: "", meta: true, sequences: ["\x1b[1;3D"] },
  { name: "up", input: "", ctrl: true, sequences: ["\x1b[1;5A"] },
  { name: "down", input: "", ctrl: true, sequences: ["\x1b[1;5B"] },
  { name: "right", input: "", ctrl: true, sequences: ["\x1b[1;5C"] },
  { name: "left", input: "", ctrl: true, sequences: ["\x1b[1;5D"] },
  { name: "up", input: "", ctrl: true, shift: true, sequences: ["\x1b[1;6A"] },
  { name: "down", input: "", ctrl: true, shift: true, sequences: ["\x1b[1;6B"] },
  { name: "right", input: "", ctrl: true, shift: true, sequences: ["\x1b[1;6C"] },
  { name: "left", input: "", ctrl: true, shift: true, sequences: ["\x1b[1;6D"] }
];

export function buildReverseKeymap(entries: readonly FixedKeymapEntry[]): ReverseKeymap {
  const bySequence = new Map<string, InputEvent>();

  for (const entry of entries) {
    for (const sequence of entry.sequences) {
      bySequence.set(
        sequence,
        keyEvent(
          entry.name,
          entry.input ?? "",
          sequence,
          Boolean(entry.ctrl),
          Boolean(entry.meta),
          Boolean(entry.shift)
        )
      );
    }
  }

  return { bySequence };
}
