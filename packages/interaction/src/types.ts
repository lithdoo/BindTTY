import type { TerminalKeyEvent } from "@bindtty/terminal";
import type { BindingValue, MountedElementNode, MountedNode } from "@bindtty/vnode";

export type InteractionFocusChangeReason =
  | "initial"
  | "next"
  | "previous"
  | "programmatic"
  | "clear"
  | "refresh";

export interface InteractionFocusSnapshot {
  id: string;
}

export interface InteractionFocusChangeEvent {
  previous: InteractionFocusSnapshot | null;
  current: InteractionFocusSnapshot | null;
  reason: InteractionFocusChangeReason;
}

export interface InteractionNodeFocusChangeEvent {
  id: string;
  focused: boolean;
  reason: InteractionFocusChangeReason;
}

export type InteractionFocusChangeListener = (
  event: InteractionFocusChangeEvent
) => void;

export type KeyEventPhase = "capture" | "target" | "bubble";

export interface BindTTYKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
  phase: KeyEventPhase;
  propagationStopped: boolean;
  stopPropagation(): void;
}

export type InteractionKeyHandler = (
  event: BindTTYKeyEvent
) => boolean | void;

export type InteractionKeyListener =
  | InteractionKeyHandler
  | null
  | undefined;

export type InteractionKeyBinding =
  | boolean
  | InteractionKeyHandler
  | null
  | undefined;

export interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;
  focusable?: BindingValue<boolean>;
  onKeyCapture?: BindingValue<InteractionKeyListener>;
  onKey?: BindingValue<InteractionKeyBinding>;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export interface InteractionResult {
  handled: boolean;
  dirtyNodes: MountedNode[];
  focusChange?: InteractionFocusChangeEvent;
}

export interface InteractionController {
  refresh(root: MountedNode | null): InteractionResult;
  handleKey(event: TerminalKeyEvent): InteractionResult;
  onFocusChange(listener: InteractionFocusChangeListener): () => void;
  focus(target: string | MountedElementNode): InteractionResult;
  focusNext(): InteractionResult;
  focusPrevious(): InteractionResult;
  clearFocus(): InteractionResult;
  getFocusedId(): string | null;
  getFocusedNode(): MountedElementNode | null;
  isFocused(node: MountedNode): boolean;
  dispose(): void;
}
