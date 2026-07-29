import type { Dispose } from "./index.js";

export interface ReactiveOwner {
  readonly parent?: ReactiveOwner;
  readonly children: Set<ReactiveOwner>;
  readonly cleanups: Dispose[];
  disposed: boolean;
}

const ownerStack: ReactiveOwner[] = [];

export function createReactiveOwner(): ReactiveOwner {
  const parent = getCurrentOwner();
  const owner: ReactiveOwner = {
    parent,
    children: new Set(),
    cleanups: [],
    disposed: false
  };
  parent?.children.add(owner);
  return owner;
}

export function getCurrentOwner(): ReactiveOwner | undefined {
  return ownerStack[ownerStack.length - 1];
}

export function runWithOwner<T>(owner: ReactiveOwner, callback: () => T): T {
  if (owner.disposed) {
    throw new Error("Cannot run with a disposed reactive owner");
  }

  ownerStack.push(owner);
  try {
    return callback();
  } finally {
    ownerStack.pop();
  }
}

export function registerOwnedCleanup(cleanup: Dispose): void {
  getCurrentOwner()?.cleanups.push(cleanup);
}

export function disposeReactiveOwner(owner: ReactiveOwner): void {
  if (owner.disposed) {
    return;
  }

  owner.disposed = true;
  owner.parent?.children.delete(owner);
  const errors: unknown[] = [];

  for (const child of [...owner.children].reverse()) {
    try {
      disposeReactiveOwner(child);
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  owner.children.clear();

  for (let index = owner.cleanups.length - 1; index >= 0; index -= 1) {
    try {
      owner.cleanups[index]!();
    } catch (error) {
      collectErrors(errors, error);
    }
  }
  owner.cleanups.length = 0;

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Reactive owner cleanup failed");
  }
}

function collectErrors(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    errors.push(...error.errors);
    return;
  }
  errors.push(error);
}
