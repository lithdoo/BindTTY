import type {
  MountedElementApi,
  MountedElementNode,
  MountedElementRefHandler
} from "@bindtty/vnode";
import type {
  RuntimeContext,
  RuntimeLifecyclePhase
} from "./types.js";

interface MountedElementLifecycleState {
  disposed: boolean;
  latestLayout: unknown | null;
  context?: RuntimeContext;
}

const lifecycleStates = new WeakMap<
  MountedElementNode,
  MountedElementLifecycleState
>();

export function createMountedElementApi(
  node: MountedElementNode,
  context?: RuntimeContext
): MountedElementApi {
  const state: MountedElementLifecycleState = {
    disposed: false,
    latestLayout: null,
    context
  };

  lifecycleStates.set(node, state);

  return {
    get tag() {
      return node.tag;
    },
    get id() {
      const id = node.props.id;
      return typeof id === "string" || typeof id === "number" ? id : undefined;
    },
    getProp(name: string): unknown {
      return node.props[name];
    },
    getLayout(): unknown | null {
      return state.disposed ? null : state.latestLayout;
    }
  };
}

export function runElementRef(
  node: MountedElementNode,
  ref: MountedElementRefHandler | undefined,
  context?: RuntimeContext
): void {
  if (!ref) {
    return;
  }

  const api = createMountedElementApi(node, context);
  node.api = api;
  ref(api);
}

export function notifyElementMounted(node: MountedElementNode): void {
  try {
    node.api?.onMounted?.();
  } catch (error) {
    reportLifecycleError(node, "mounted", error);
  }
}

export function notifyElementLayout(
  node: MountedElementNode,
  layout: unknown
): void {
  const state = lifecycleStates.get(node);

  if (!node.api || !state || state.disposed) {
    return;
  }

  state.latestLayout = layout;
  try {
    node.api.onLayout?.(layout);
  } catch (error) {
    reportLifecycleError(node, "layout", error);
  }
}

export function disposeElementApi(node: MountedElementNode): void {
  const api = node.api;
  const state = lifecycleStates.get(node);

  if (!api || !state || state.disposed) {
    return;
  }

  state.disposed = true;
  state.latestLayout = null;
  try {
    api.onUnmount?.();
  } catch (error) {
    reportLifecycleError(node, "unmount", error);
  } finally {
    api.onMounted = undefined;
    api.onLayout = undefined;
    api.onUnmount = undefined;
  }
}

function reportLifecycleError(
  node: MountedElementNode,
  phase: RuntimeLifecyclePhase,
  error: unknown
): void {
  const state = lifecycleStates.get(node);

  state?.context?.onLifecycleError?.({
    phase,
    node,
    error
  });
}
