import type { InputEvent } from "./events.js";

export type InputProtocol =
  | "kitty"
  | "modify-other-keys"
  | "windows-vt"
  | "win32"
  | "legacy-vt"
  | "readline";

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
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
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
 * Compatibility bridge for consumers migrating from the original event shape.
 * Protocol adapters should pass the protocol they actually selected.
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
    key: event.name ?? event.input,
    ctrl: event.ctrl,
    meta: event.meta,
    shift: event.shift,
    repeat: 1,
    protocol,
    sequence: event.sequence
  };
}
