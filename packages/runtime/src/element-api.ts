import type {
  MountedElementApi,
  MountedElementNode,
  MountedElementRefHandler
} from "@bindtty/vnode";

interface MountedElementLifecycleState {
  disposed: boolean;
  latestLayout: unknown | null;
}

const lifecycleStates = new WeakMap<
  MountedElementNode,
  MountedElementLifecycleState
>();

export function createMountedElementApi(
  node: MountedElementNode
): MountedElementApi {
  const state: MountedElementLifecycleState = {
    disposed: false,
    latestLayout: null
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
  ref: MountedElementRefHandler | undefined
): void {
  if (!ref) {
    return;
  }

  const api = createMountedElementApi(node);
  node.api = api;
  ref(api);
}

export function notifyElementMounted(node: MountedElementNode): void {
  node.api?.onMounted?.();
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
  node.api.onLayout?.(layout);
}

export function disposeElementApi(node: MountedElementNode): void {
  const api = node.api;
  const state = lifecycleStates.get(node);

  if (!api || !state || state.disposed) {
    return;
  }

  state.disposed = true;
  state.latestLayout = null;
  api.onUnmount?.();
  api.onMounted = undefined;
  api.onLayout = undefined;
  api.onUnmount = undefined;
}
