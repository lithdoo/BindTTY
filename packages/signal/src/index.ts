export type Dispose = () => void;
export type SignalListener<T> = (value: T, previousValue: T) => void;
export type EffectCleanup = void | Dispose;

interface ReactiveSource {
  addSubscriber(subscriber: ReactiveSubscriber): void;
  removeSubscriber(subscriber: ReactiveSubscriber): void;
}

type ReactiveSubscriber = () => void;

interface ReactiveComputation {
  dependencies: Set<ReactiveSource>;
  disposed: boolean;
  run: ReactiveSubscriber;
}

export interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: SignalListener<T>): Dispose;
}

export interface Signal<T> extends ReadableSignal<T> {
  set(value: T): void;
  update(updater: (value: T) => T): void;
}

const computationStack: ReactiveComputation[] = [];

function getActiveComputation(): ReactiveComputation | undefined {
  return computationStack[computationStack.length - 1];
}

function cleanupDependencies(computation: ReactiveComputation): void {
  for (const dependency of computation.dependencies) {
    dependency.removeSubscriber(computation.run);
  }
  computation.dependencies.clear();
}

function trackDependency(source: ReactiveSource): void {
  const computation = getActiveComputation();
  if (!computation || computation.disposed || computation.dependencies.has(source)) {
    return;
  }

  computation.dependencies.add(source);
  source.addSubscriber(computation.run);
}

function createComputation(runBody: () => void): ReactiveComputation {
  const computation: ReactiveComputation = {
    dependencies: new Set(),
    disposed: false,
    run: () => {
      if (computation.disposed) {
        return;
      }

      cleanupDependencies(computation);
      computationStack.push(computation);
      try {
        runBody();
      } finally {
        computationStack.pop();
      }
    }
  };

  return computation;
}

function notifySubscribers(subscribers: Set<ReactiveSubscriber>): void {
  for (const subscriber of [...subscribers]) {
    subscriber();
  }
}

function notifyListeners<T>(
  listeners: Set<SignalListener<T>>,
  value: T,
  previousValue: T
): void {
  for (const listener of [...listeners]) {
    listener(value, previousValue);
  }
}

export function createSignal<T>(initialValue: T): Signal<T> {
  let currentValue = initialValue;
  const subscribers = new Set<ReactiveSubscriber>();
  const listeners = new Set<SignalListener<T>>();

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

      const previousValue = currentValue;
      currentValue = value;
      notifySubscribers(subscribers);
      notifyListeners(listeners, currentValue, previousValue);
    },
    update(updater) {
      this.set(updater(currentValue));
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
  let currentValue: T;
  const subscribers = new Set<ReactiveSubscriber>();
  const listeners = new Set<SignalListener<T>>();

  const source: ReactiveSource = {
    addSubscriber(subscriber) {
      subscribers.add(subscriber);
    },
    removeSubscriber(subscriber) {
      subscribers.delete(subscriber);
    }
  };

  const computation = createComputation(() => {
    const nextValue = derive();
    if (initialized && Object.is(currentValue, nextValue)) {
      return;
    }

    const previousValue = currentValue;
    currentValue = nextValue;
    const hadPreviousValue = initialized;
    initialized = true;

    if (hadPreviousValue) {
      notifySubscribers(subscribers);
      notifyListeners(listeners, currentValue, previousValue);
    }
  });

  computation.run();

  return {
    get() {
      trackDependency(source);
      return currentValue!;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function effect(runEffect: () => EffectCleanup): Dispose {
  let cleanup: EffectCleanup;

  const computation = createComputation(() => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    cleanup = runEffect();
  });

  computation.run();

  return () => {
    if (computation.disposed) {
      return;
    }

    computation.disposed = true;
    cleanupDependencies(computation);
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  };
}
