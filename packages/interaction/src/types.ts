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
  node: MountedElementNode;
}

export interface InteractionFocusChangeEvent {
  previous: InteractionFocusSnapshot | null;
  current: InteractionFocusSnapshot | null;
  reason: InteractionFocusChangeReason;
}

export interface InteractionNodeFocusChangeEvent {
  id: string;
  node: MountedElementNode;
  focused: boolean;
  reason: InteractionFocusChangeReason;
}

export type InteractionFocusChangeListener = (
  event: InteractionFocusChangeEvent
) => void;

export interface InteractionKeyContext {
  node: MountedElementNode;
  isFocused: true;
}

export type InteractionKeyHandler = (
  event: TerminalKeyEvent,
  context: InteractionKeyContext
) => boolean | void;

export type InteractionKeyBinding =
  | boolean
  | InteractionKeyHandler
  | null
  | undefined;

export interface IntrinsicInteractionProps {
  id?: BindingValue<string | number>;
  onKey?: BindingValue<InteractionKeyBinding>;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export interface InteractionResult {
  handled: boolean;
  dirtyNodes: MountedNode[];
  focusChange?: InteractionFocusChangeEvent;
}

export interface KeyFocusEntry {
  id: string;
  node: MountedElementNode;
  order: number;
  handler: InteractionKeyHandler | null;
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
