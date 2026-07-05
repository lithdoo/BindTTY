import type { TerminalKeyEvent } from "@bindtty/terminal";
import type { MountedElementNode } from "@bindtty/vnode";
import { isShiftTabKey, isTabKey } from "./keyboard.js";
import type {
  BindTTYKeyEvent,
  InteractionKeyBinding,
  InteractionKeyListener,
  InteractionResult,
  KeyEventPhase
} from "./types.js";

export function createKeyEvent(raw: TerminalKeyEvent): BindTTYKeyEvent {
  const event: BindTTYKeyEvent = {
    input: raw.input,
    name: raw.name,
    ctrl: raw.ctrl,
    meta: raw.meta,
    shift: raw.shift,
    sequence: raw.sequence,
    phase: "target",
    propagationStopped: false,
    stopPropagation() {
      event.propagationStopped = true;
    }
  };

  return event;
}

export function resolveKeyCaptureBinding(
  node: MountedElementNode
): InteractionKeyListener {
  return node.props.onKeyCapture as InteractionKeyListener;
}

export function resolveKeyBinding(
  node: MountedElementNode
): InteractionKeyBinding {
  return node.props.onKey as InteractionKeyBinding;
}

export function dispatchTo(
  node: MountedElementNode,
  phase: KeyEventPhase,
  event: BindTTYKeyEvent
): boolean {
  event.phase = phase;

  const binding =
    phase === "capture"
      ? resolveKeyCaptureBinding(node)
      : resolveKeyBinding(node);

  if (binding === true || typeof binding !== "function") {
    return false;
  }

  const handled = binding(event) === true;

  if (handled) {
    event.stopPropagation();
    return true;
  }

  return false;
}

export function runTabFallback(
  raw: TerminalKeyEvent,
  moveFocus: (step: 1 | -1) => InteractionResult
): InteractionResult {
  if (isTabKey(raw)) {
    return isShiftTabKey(raw) ? moveFocus(-1) : moveFocus(1);
  }

  return {
    handled: false,
    dirtyNodes: []
  };
}
