import type { Readable } from "node:stream";

import type {
  Dispose,
  StdinInputAdapter,
  TerminalKeyEvent,
  Win32InputProvider,
  Win32KeyRecord
} from "../types.js";

const RIGHT_ALT_PRESSED = 0x0001;
const LEFT_ALT_PRESSED = 0x0002;
const RIGHT_CTRL_PRESSED = 0x0004;
const LEFT_CTRL_PRESSED = 0x0008;
const SHIFT_PRESSED = 0x0010;

const VK_BACK = 0x08;
const VK_TAB = 0x09;
const VK_RETURN = 0x0d;
const VK_ESCAPE = 0x1b;
const VK_PRIOR = 0x21;
const VK_NEXT = 0x22;
const VK_END = 0x23;
const VK_HOME = 0x24;
const VK_LEFT = 0x25;
const VK_UP = 0x26;
const VK_RIGHT = 0x27;
const VK_DOWN = 0x28;
const VK_INSERT = 0x2d;
const VK_DELETE = 0x2e;
const VK_F1 = 0x70;
const VK_F12 = 0x7b;

export class Win32ConsoleInput implements StdinInputAdapter {
  readonly kind = "win32" as const;

  constructor(private readonly provider: Win32InputProvider) {}

  prepare(_stdin: Readable): void {}

  attach(
    _stdin: Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose {
    return this.provider.attach((record) => {
      const event = mapWin32KeyRecord(record);
      if (!event) {
        return;
      }

      for (let index = 0; index < Math.max(1, record.repeatCount); index += 1) {
        onKey(event);
      }
    });
  }
}

export function mapWin32KeyRecord(record: Win32KeyRecord): TerminalKeyEvent | null {
  if (!record.keyDown) {
    return null;
  }

  const ctrl = hasFlag(record.controlKeyState, LEFT_CTRL_PRESSED | RIGHT_CTRL_PRESSED);
  const meta = hasFlag(record.controlKeyState, LEFT_ALT_PRESSED | RIGHT_ALT_PRESSED);
  const shift = hasFlag(record.controlKeyState, SHIFT_PRESSED);
  const name = readVirtualKeyName(record.virtualKeyCode);

  if (name) {
    return {
      kind: "key",
      protocol: "win32",
      input: name === "return" ? "\r" : "",
      name,
      ctrl,
      meta,
      shift,
      sequence: win32Sequence(record)
    };
  }

  if (record.unicode !== "") {
    return {
      kind: ctrl || meta ? "key" : "text",
      protocol: "win32",
      input: record.unicode,
      ...(ctrl || meta ? { name: record.unicode.toLocaleLowerCase() } : {}),
      ctrl,
      meta,
      shift,
      sequence: win32Sequence(record)
    };
  }

  return null;
}

function readVirtualKeyName(code: number): string | null {
  if (code >= VK_F1 && code <= VK_F12) {
    return `f${code - VK_F1 + 1}`;
  }

  switch (code) {
    case VK_BACK: return "backspace";
    case VK_TAB: return "tab";
    case VK_RETURN: return "return";
    case VK_ESCAPE: return "escape";
    case VK_PRIOR: return "pageup";
    case VK_NEXT: return "pagedown";
    case VK_END: return "end";
    case VK_HOME: return "home";
    case VK_LEFT: return "left";
    case VK_UP: return "up";
    case VK_RIGHT: return "right";
    case VK_DOWN: return "down";
    case VK_INSERT: return "insert";
    case VK_DELETE: return "delete";
    default: return null;
  }
}

function hasFlag(value: number, flags: number): boolean {
  return (value & flags) !== 0;
}

function win32Sequence(record: Win32KeyRecord): string {
  return `win32:${record.virtualKeyCode.toString(16)}:${record.scanCode.toString(16)}`;
}
