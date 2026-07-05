import type { TerminalKeyEvent } from "@bindtty/terminal";
import type { MountedElementNode, MountedNode } from "@bindtty/vnode";
import {
  createKeyEvent,
  dispatchTo,
  runTabFallback
} from "./dispatch.js";
import type {
  InteractionController,
  InteractionFocusChangeEvent,
  InteractionFocusChangeListener,
  InteractionFocusChangeReason,
  InteractionFocusSnapshot,
  InteractionKeyBinding,
  InteractionResult
} from "./types.js";

interface FocusState {
  entry: FocusEntry | null;
  previousOrder: number | null;
  focusedPath: MountedElementNode[];
}

interface FocusEntry {
  id: string;
  node: MountedElementNode;
  order: number;
  path: MountedElementNode[];
}

function createEmptyResult(handled = false): InteractionResult {
  return {
    handled,
    dirtyNodes: []
  };
}

function uniqueNodes(nodes: MountedElementNode[]): MountedNode[] {
  const seen = new Set<MountedElementNode>();
  const result: MountedNode[] = [];

  for (const node of nodes) {
    if (seen.has(node)) {
      continue;
    }

    seen.add(node);
    result.push(node);
  }

  return result;
}

function collectFocusDirtyNodes(
  previousPath: MountedElementNode[],
  nextPath: MountedElementNode[]
): MountedNode[] {
  return uniqueNodes([...previousPath, ...nextPath]);
}

export function createInteractionController(): InteractionController {
  const focusChangeListeners = new Set<InteractionFocusChangeListener>();
  const internalIds = new WeakMap<MountedElementNode, string>();
  let nextInternalId = 1;
  let entries: FocusEntry[] = [];
  let focusState: FocusState = {
    entry: null,
    previousOrder: null,
    focusedPath: []
  };
  let disposed = false;

  function allocateInternalId(node: MountedElementNode): string {
    const existing = internalIds.get(node);
    if (existing) {
      return existing;
    }

    const id = `bindtty-internal-focus-${nextInternalId}`;
    nextInternalId += 1;
    internalIds.set(node, id);
    return id;
  }

  function getEntryId(node: MountedElementNode): string {
    const id = node.props.id;

    if (typeof id === "string" || typeof id === "number") {
      return String(id);
    }

    return allocateInternalId(node);
  }

  function resolveOnKey(value: unknown): InteractionKeyBinding {
    return value as InteractionKeyBinding;
  }

  function isFocusable(node: MountedElementNode): boolean {
    const explicit = node.props.focusable;

    if (explicit !== undefined) {
      return explicit === true;
    }

    const onKey = resolveOnKey(node.props.onKey);
    return onKey === true || typeof onKey === "function";
  }

  function collectEntries(root: MountedNode | null): FocusEntry[] {
    const nextEntries: FocusEntry[] = [];
    const path: MountedElementNode[] = [];
    let order = 0;

    function visit(node: MountedNode | null): void {
      if (!node) {
        return;
      }

      switch (node.kind) {
        case "element": {
          path.push(node);

          if (isFocusable(node)) {
            nextEntries.push({
              id: getEntryId(node),
              node,
              order,
              path: [...path]
            });
          }

          order += 1;

          for (const child of node.children) {
            visit(child);
          }

          path.pop();
          return;
        }
        case "fragment":
          for (const child of node.children) {
            visit(child);
          }
          return;
        case "show":
          visit(node.activeBranch);
          return;
        case "for":
          for (const item of node.items) {
            visit(item.node);
          }
          return;
      }
    }

    visit(root);
    return nextEntries;
  }

  function toSnapshot(entry: FocusEntry | null): InteractionFocusSnapshot | null {
    if (!entry) {
      return null;
    }

    return {
      id: entry.id,
      node: entry.node
    };
  }

  function readNodeFocusChange(node: MountedElementNode): unknown {
    return node.props.onFocusChange;
  }

  function notifyNodeFocusChange(
    entry: FocusEntry,
    focused: boolean,
    reason: InteractionFocusChangeReason
  ): void {
    const listener = readNodeFocusChange(entry.node);

    if (typeof listener === "function") {
      listener({
        id: entry.id,
        node: entry.node,
        focused,
        reason
      });
    }
  }

  function buildFocusResult(
    previous: FocusEntry | null,
    current: FocusEntry | null,
    previousPath: MountedElementNode[],
    reason: InteractionFocusChangeReason,
    handled: boolean
  ): InteractionResult {
    if (previous?.node === current?.node) {
      return createEmptyResult(handled);
    }

    const focusChange: InteractionFocusChangeEvent = {
      previous: toSnapshot(previous),
      current: toSnapshot(current),
      reason
    };
    const dirtyNodes = collectFocusDirtyNodes(
      previousPath,
      current?.path ?? []
    );

    if (previous) {
      notifyNodeFocusChange(previous, false, reason);
    }

    if (current) {
      notifyNodeFocusChange(current, true, reason);
    }

    for (const listener of [...focusChangeListeners]) {
      listener(focusChange);
    }

    return {
      handled,
      dirtyNodes,
      focusChange
    };
  }

  function setFocusedEntry(
    entry: FocusEntry | null,
    reason: InteractionFocusChangeReason,
    handled: boolean
  ): InteractionResult {
    const previous = focusState.entry;
    const previousPath = focusState.focusedPath;

    focusState = {
      entry,
      previousOrder: entry?.order ?? previous?.order ?? focusState.previousOrder,
      focusedPath: entry?.path ?? []
    };

    return buildFocusResult(previous, entry, previousPath, reason, handled);
  }

  function findEntryForNode(node: MountedElementNode): FocusEntry | null {
    return entries.find((entry) => entry.node === node) ?? null;
  }

  function findEntryForId(id: string): FocusEntry | null {
    return entries.find((entry) => entry.id === id) ?? null;
  }

  function findRefreshFallback(previousOrder: number | null): FocusEntry | null {
    if (entries.length === 0) {
      return null;
    }

    if (previousOrder === null) {
      return entries[0]!;
    }

    return (
      entries.find((entry) => entry.order >= previousOrder) ??
      entries[entries.length - 1]!
    );
  }

  function moveFocus(step: 1 | -1): InteractionResult {
    if (disposed || entries.length === 0) {
      return createEmptyResult(false);
    }

    if (entries.length === 1 && focusState.entry) {
      return createEmptyResult(true);
    }

    let nextIndex: number;

    if (!focusState.entry) {
      nextIndex = step === 1 ? 0 : entries.length - 1;
    } else {
      const currentIndex = entries.findIndex(
        (entry) => entry.node === focusState.entry?.node
      );

      if (currentIndex === -1) {
        nextIndex = step === 1 ? 0 : entries.length - 1;
      } else {
        nextIndex = (currentIndex + step + entries.length) % entries.length;
      }
    }

    return setFocusedEntry(
      entries[nextIndex]!,
      step === 1 ? "next" : "previous",
      true
    );
  }

  function runFallbackKeyAction(raw: TerminalKeyEvent): InteractionResult {
    return runTabFallback(raw, moveFocus);
  }

  return {
    refresh(root: MountedNode | null): InteractionResult {
      if (disposed) {
        return createEmptyResult();
      }

      const previousEntry = focusState.entry;
      const previousOrder = previousEntry?.order ?? focusState.previousOrder;
      entries = collectEntries(root);

      if (previousEntry) {
        const retained = findEntryForNode(previousEntry.node);

        if (retained) {
          focusState = {
            entry: retained,
            previousOrder: retained.order,
            focusedPath: retained.path
          };
          return createEmptyResult();
        }
      }

      const nextEntry = findRefreshFallback(previousOrder);
      const reason = previousEntry ? "refresh" : "initial";

      return setFocusedEntry(nextEntry, reason, false);
    },

    handleKey(event: TerminalKeyEvent): InteractionResult {
      if (disposed) {
        return createEmptyResult(false);
      }

      const focusedEntry = focusState.entry;

      if (!focusedEntry) {
        return runFallbackKeyAction(event);
      }

      const keyEvent = createKeyEvent(event);
      let handled = false;

      for (const node of focusedEntry.path.slice(0, -1)) {
        handled = dispatchTo(node, "capture", keyEvent) || handled;
        if (keyEvent.propagationStopped) {
          break;
        }
      }

      if (!keyEvent.propagationStopped) {
        handled =
          dispatchTo(focusedEntry.node, "target", keyEvent) || handled;
      }

      if (!keyEvent.propagationStopped) {
        for (const node of focusedEntry.path.slice(0, -1).reverse()) {
          handled = dispatchTo(node, "bubble", keyEvent) || handled;
          if (keyEvent.propagationStopped) {
            break;
          }
        }
      }

      if (!handled) {
        return runFallbackKeyAction(event);
      }

      return createEmptyResult(true);
    },

    onFocusChange(listener: InteractionFocusChangeListener): () => void {
      if (disposed) {
        return () => {};
      }

      focusChangeListeners.add(listener);

      return () => {
        focusChangeListeners.delete(listener);
      };
    },

    focus(target: string | MountedElementNode): InteractionResult {
      if (disposed) {
        return createEmptyResult();
      }

      const entry =
        typeof target === "string"
          ? findEntryForId(target)
          : findEntryForNode(target);

      if (!entry) {
        return createEmptyResult(false);
      }

      return setFocusedEntry(entry, "programmatic", true);
    },

    focusNext(): InteractionResult {
      return moveFocus(1);
    },

    focusPrevious(): InteractionResult {
      return moveFocus(-1);
    },

    clearFocus(): InteractionResult {
      if (disposed || !focusState.entry) {
        return createEmptyResult(false);
      }

      return setFocusedEntry(null, "clear", true);
    },

    getFocusedId(): string | null {
      return focusState.entry?.id ?? null;
    },

    getFocusedNode(): MountedElementNode | null {
      return focusState.entry?.node ?? null;
    },

    isFocused(node: MountedNode): boolean {
      return node.kind === "element" && focusState.entry?.node === node;
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      focusChangeListeners.clear();
      entries = [];
      focusState = {
        entry: null,
        previousOrder: null,
        focusedPath: []
      };
    }
  };
}
