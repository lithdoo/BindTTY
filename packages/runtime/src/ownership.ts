import {
  createReactiveOwner,
  disposeReactiveOwner,
  runWithOwner,
  type ReactiveOwner
} from "@bindtty/signal/internal";
import type { MountedNode } from "@bindtty/vnode";

const nodeOwners = new WeakMap<MountedNode, ReactiveOwner[]>();

export function createRuntimeOwner(): ReactiveOwner {
  return createReactiveOwner();
}

export function runWithRuntimeOwner<T>(
  owner: ReactiveOwner,
  callback: () => T
): T {
  return runWithOwner(owner, callback);
}

export function mountWithOwner(
  callback: () => MountedNode | null,
  parent?: ReactiveOwner
): MountedNode | null {
  const owner = parent
    ? runWithOwner(parent, createReactiveOwner)
    : createReactiveOwner();

  try {
    const node = runWithOwner(owner, callback);
    if (!node) {
      disposeReactiveOwner(owner);
      return null;
    }
    associateMountedNodeOwner(node, owner);
    return node;
  } catch (error) {
    try {
      disposeReactiveOwner(owner);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Reactive mount and cleanup failed"
      );
    }
    throw error;
  }
}

export function mountControlWithOwner<T extends MountedNode>(
  callback: (owner: ReactiveOwner) => T
): T {
  const owner = createReactiveOwner();
  try {
    const node = runWithOwner(owner, () => callback(owner));
    associateMountedNodeOwner(node, owner);
    return node;
  } catch (error) {
    try {
      disposeReactiveOwner(owner);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Reactive mount and cleanup failed"
      );
    }
    throw error;
  }
}

function associateMountedNodeOwner(
  node: MountedNode,
  owner: ReactiveOwner
): void {
  const owners = nodeOwners.get(node) ?? [];
  owners.push(owner);
  nodeOwners.set(node, owners);
}

export function disposeMountedNodeOwners(node: MountedNode): void {
  const owners = nodeOwners.get(node);
  if (!owners) {
    return;
  }
  nodeOwners.delete(node);

  const errors: unknown[] = [];
  for (const owner of [...owners].reverse()) {
    try {
      disposeReactiveOwner(owner);
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  throwCollectedErrors(errors);
}

export function disposeRuntimeOwner(owner: ReactiveOwner): void {
  disposeReactiveOwner(owner);
}

export function throwCollectedErrors(errors: unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Runtime cleanup failed");
  }
}

export function collectErrors(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    errors.push(...error.errors);
    return;
  }
  errors.push(error);
}

export type { ReactiveOwner };
