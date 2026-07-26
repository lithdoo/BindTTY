import type { InputEvent } from "./events.js";

export type InputProtocol =
  | "kitty"
  | "modify-other-keys"
  | "windows-vt"
  | "win32"
  | "legacy-vt"
  | "readline";

export type FunctionKeyName =
  | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"
  | "f7" | "f8" | "f9" | "f10" | "f11" | "f12"
  | "f13" | "f14" | "f15" | "f16" | "f17" | "f18"
  | "f19" | "f20" | "f21" | "f22" | "f23" | "f24";

export type KnownKeyName =
  | FunctionKeyName
  | "enter"
  | "escape"
  | "tab"
  | "backspace"
  | "delete"
  | "insert"
  | "home"
  | "end"
  | "pageup"
  | "pagedown"
  | "up"
  | "down"
  | "left"
  | "right";

/**
 * Known names provide autocomplete while the string intersection preserves
 * compatibility with printable and application-defined key names.
 */
export type KeyName = KnownKeyName | (string & {});

export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface SemanticInputEventBase {
  protocol: InputProtocol;
  sequence?: string;
}

export interface TextInputEvent extends SemanticInputEventBase {
  kind: "text";
  text: string;
}

export interface KeyInputEvent extends SemanticInputEventBase {
  kind: "key";
  key: KeyName;
  modifiers: KeyModifiers;
  repeat: number;
}

export interface PasteInputEvent extends SemanticInputEventBase {
  kind: "paste";
  text: string;
}

export interface UnknownInputEvent extends SemanticInputEventBase {
  kind: "unknown";
  raw: string;
  reason: string;
}

export type SemanticInputEvent =
  | TextInputEvent
  | KeyInputEvent
  | PasteInputEvent
  | UnknownInputEvent;

/**
 * Converts the original parser event shape at the protocol boundary. New
 * consumers should use SemanticInputEvent exclusively.
 */
export function toSemanticInputEvent(
  event: InputEvent,
  protocol: InputProtocol = "legacy-vt"
): SemanticInputEvent {
  if (event.name === "paste") {
    return {
      kind: "paste",
      text: event.input,
      protocol,
      sequence: event.sequence
    };
  }

  if (event.name === "unknown") {
    return {
      kind: "unknown",
      raw: event.sequence ?? "",
      reason: "unrecognized-input-sequence",
      protocol,
      sequence: event.sequence
    };
  }

  if (event.name === undefined && !event.ctrl && !event.meta) {
    return {
      kind: "text",
      text: event.input,
      protocol,
      sequence: event.sequence
    };
  }

  return {
    kind: "key",
    key: normalizeKeyName(event.name ?? event.input),
    modifiers: {
      ctrl: event.ctrl,
      alt: event.meta,
      shift: event.shift,
      meta: false
    },
    repeat: 1,
    protocol,
    sequence: event.sequence
  };
}

function normalizeKeyName(name: string): KeyName {
  return name === "return" ? "enter" : name;
}
