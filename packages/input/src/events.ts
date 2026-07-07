export interface InputKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}

export interface InputUnknownEvent {
  input: "";
  name: "unknown";
  ctrl: false;
  meta: false;
  shift: false;
  sequence: string;
}

export interface InputPasteEvent {
  input: string;
  name: "paste";
  ctrl: false;
  meta: false;
  shift: false;
  sequence: string;
}

export type InputEvent = InputKeyEvent | InputUnknownEvent | InputPasteEvent;

export function textEvent(input: string, sequence = input): InputKeyEvent {
  return {
    input,
    ctrl: false,
    meta: false,
    shift: false,
    sequence
  };
}

export function keyEvent(
  name: string,
  input: string,
  sequence: string,
  ctrl = false,
  meta = false,
  shift = false
): InputKeyEvent {
  return {
    input,
    name,
    ctrl,
    meta,
    shift,
    sequence
  };
}

export function unknownEvent(sequence: string): InputUnknownEvent {
  return {
    input: "",
    name: "unknown",
    ctrl: false,
    meta: false,
    shift: false,
    sequence
  };
}

export function pasteEvent(input: string, sequence: string): InputPasteEvent {
  return {
    input,
    name: "paste",
    ctrl: false,
    meta: false,
    shift: false,
    sequence
  };
}
