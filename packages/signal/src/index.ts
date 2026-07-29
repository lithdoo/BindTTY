export type Dispose = () => void;
export type SignalListener<T> = (value: T, previousValue: T) => void;
export type EffectCleanup = void | Dispose;

import { registerOwnedCleanup } from "./owner.js";

interface ReactiveSubscriber {
  invalidate(): void;
}

interface ReactiveSource {
  addSubscriber(subscriber: ReactiveSubscriber): void;
  removeSubscriber(subscriber: ReactiveSubscriber): void;
}

interface ReactiveComputation extends ReactiveSubscriber {
  dependencies: Set<ReactiveSource>;
  collectingDependencies?: Set<ReactiveSource>;
  disposed: boolean;
}

export interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: SignalListener<T>): Dispose;
}

export interface Signal<T> extends ReadableSignal<T> {
  set(value: T): void;
}

const MAX_TRANSACTION_JOBS = 1_000;
const computationStack: ReactiveComputation[] = [];
const pendingJobs = new Set<() => void>();
const pendingJobAborts = new Map<() => void, () => void>();
let transactionDepth = 0;
let flushing = false;

function getActiveComputation(): ReactiveComputation | undefined {
  return computationStack[computationStack.length - 1];
}

function trackDependency(source: ReactiveSource): void {
  const computation = getActiveComputation();
  if (!computation || computation.disposed) {
    return;
  }

  const dependencies = computation.collectingDependencies ?? computation.dependencies;
  if (dependencies.has(source)) {
    return;
  }

  dependencies.add(source);
  source.addSubscriber(computation);
}

function runTracked<T>(computation: ReactiveComputation, body: () => T): T {
  const previousDependencies = computation.dependencies;
  const nextDependencies = new Set<ReactiveSource>();
  computation.collectingDependencies = nextDependencies;
  computationStack.push(computation);

  try {
    const result = body();
    for (const dependency of previousDependencies) {
      if (!nextDependencies.has(dependency)) {
        dependency.removeSubscriber(computation);
      }
    }
    computation.dependencies = nextDependencies;
    return result;
  } catch (error) {
    for (const dependency of nextDependencies) {
      if (!previousDependencies.has(dependency)) {
        dependency.removeSubscriber(computation);
      }
    }
    throw error;
  } finally {
    computationStack.pop();
    computation.collectingDependencies = undefined;
  }
}

function cleanupDependencies(computation: ReactiveComputation): void {
  for (const dependency of computation.dependencies) {
    dependency.removeSubscriber(computation);
  }
  computation.dependencies.clear();
}

function enqueue(job: () => void, abort?: () => void): void {
  pendingJobs.add(job);
  if (abort) {
    pendingJobAborts.set(job, abort);
  }
}

function flushJobs(): void {
  if (flushing || transactionDepth > 0) {
    return;
  }

  flushing = true;
  let completedJobs = 0;
  try {
    while (pendingJobs.size > 0) {
      const job = pendingJobs.values().next().value as (() => void) | undefined;
      if (!job) {
        break;
      }
      pendingJobs.delete(job);
      pendingJobAborts.delete(job);
      completedJobs += 1;
      if (completedJobs > MAX_TRANSACTION_JOBS) {
        throw new Error(
          `Reactive update cycle exceeded ${MAX_TRANSACTION_JOBS} jobs`
        );
      }
      job();
    }
  } catch (error) {
    for (const job of pendingJobs) {
      pendingJobAborts.get(job)?.();
    }
    pendingJobs.clear();
    pendingJobAborts.clear();
    throw error;
  } finally {
    flushing = false;
  }
}

function runInTransaction<T>(callback: () => T): T {
  transactionDepth += 1;
  try {
    return callback();
  } finally {
    transactionDepth -= 1;
    if (transactionDepth === 0) {
      flushJobs();
    }
  }
}

export function batch<T>(callback: () => T): T {
  return runInTransaction(callback);
}

export function createSignal<T>(initialValue: T): Signal<T> {
  let currentValue = initialValue;
  const subscribers = new Set<ReactiveSubscriber>();
  const listeners = new Set<SignalListener<T>>();
  let pendingPreviousValue: T;
  let listenerPending = false;

  const notifyListeners = (): void => {
    if (!listenerPending) {
      return;
    }
    listenerPending = false;
    const previousValue = pendingPreviousValue;
    if (Object.is(previousValue, currentValue)) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(currentValue, previousValue);
    }
  };

  const source: ReactiveSource = {
    addSubscriber(subscriber) {
      subscribers.add(subscriber);
    },
    removeSubscriber(subscriber) {
      subscribers.delete(subscriber);
    }
  };

  return {
    get() {
      trackDependency(source);
      return currentValue;
    },
    set(value) {
      if (Object.is(currentValue, value)) {
        return;
      }

      runInTransaction(() => {
        const previousValue = currentValue;
        currentValue = value;
        if (listeners.size > 0 && !listenerPending) {
          pendingPreviousValue = previousValue;
          listenerPending = true;
        }
        for (const subscriber of [...subscribers]) {
          subscriber.invalidate();
        }
        if (listeners.size > 0) {
          enqueue(notifyListeners, () => {
            listenerPending = false;
          });
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function computed<T>(derive: () => T): ReadableSignal<T> {
  let initialized = false;
  let stale = true;
  let computing = false;
  let currentValue: T;
  let pendingPreviousValue: T;
  let notificationPending = false;
  const subscribers = new Set<ReactiveSubscriber>();
  const listeners = new Set<SignalListener<T>>();

  const hasConsumers = (): boolean => subscribers.size > 0 || listeners.size > 0;

  const computation: ReactiveComputation = {
    dependencies: new Set(),
    disposed: false,
    invalidate() {
      if (stale) {
        return;
      }
      stale = true;
      if (initialized && listeners.size > 0 && !notificationPending) {
        pendingPreviousValue = currentValue;
        notificationPending = true;
      }
      for (const subscriber of [...subscribers]) {
        subscriber.invalidate();
      }
      if (listeners.size > 0) {
        enqueue(notifyListeners, () => {
          notificationPending = false;
        });
      }
    }
  };

  const recompute = (): T => {
    if (computing) {
      throw new Error("Reactive computed cycle detected");
    }
    if (!stale && hasConsumers()) {
      return currentValue!;
    }

    computing = true;
    try {
      const nextValue = runInTransaction(() => runTracked(computation, derive));
      currentValue = nextValue;
      initialized = true;
      stale = false;
      return currentValue;
    } finally {
      computing = false;
      if (!hasConsumers()) {
        cleanupDependencies(computation);
        stale = true;
      }
    }
  };

  const notifyListeners = (): void => {
    if (!notificationPending) {
      return;
    }
    notificationPending = false;
    const previousValue = pendingPreviousValue;
    const value = recompute();
    if (Object.is(previousValue, value)) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(value, previousValue);
    }
  };

  const source: ReactiveSource = {
    addSubscriber(subscriber) {
      const wasDormant = !hasConsumers();
      subscribers.add(subscriber);
      if (wasDormant) {
        recompute();
      }
    },
    removeSubscriber(subscriber) {
      subscribers.delete(subscriber);
      if (!hasConsumers()) {
        cleanupDependencies(computation);
        stale = true;
      }
    }
  };

  const readable: ReadableSignal<T> = {
    get() {
      if (computation.disposed) {
        throw new Error("Reactive computation has been disposed");
      }
      trackDependency(source);
      return recompute();
    },
    subscribe(listener) {
      if (computation.disposed) {
        throw new Error("Reactive computation has been disposed");
      }
      const wasDormant = !hasConsumers();
      listeners.add(listener);
      if (wasDormant) {
        recompute();
      }
      return () => {
        listeners.delete(listener);
        if (!hasConsumers()) {
          cleanupDependencies(computation);
          stale = true;
        }
      };
    }
  };

  registerOwnedCleanup(() => {
    if (computation.disposed) {
      return;
    }
    computation.disposed = true;
    pendingJobs.delete(notifyListeners);
    pendingJobAborts.delete(notifyListeners);
    cleanupDependencies(computation);
    subscribers.clear();
    listeners.clear();
    notificationPending = false;
  });

  return readable;
}

export function effect(runEffect: () => EffectCleanup): Dispose {
  let cleanup: EffectCleanup;

  const run = (): void => {
    if (computation.disposed) {
      return;
    }
    if (cleanup) {
      const previousCleanup = cleanup;
      cleanup = undefined;
      previousCleanup();
    }
    cleanup = runInTransaction(() => runTracked(computation, runEffect));
  };

  const computation: ReactiveComputation = {
    dependencies: new Set(),
    disposed: false,
    invalidate() {
      if (!computation.disposed) {
        enqueue(run);
      }
    }
  };

  run();

  const dispose = (): void => {
    if (computation.disposed) {
      return;
    }
    computation.disposed = true;
    pendingJobs.delete(run);
    pendingJobAborts.delete(run);
    cleanupDependencies(computation);
    if (cleanup) {
      const finalCleanup = cleanup;
      cleanup = undefined;
      finalCleanup();
    }
  };

  registerOwnedCleanup(dispose);
  return dispose;
}
