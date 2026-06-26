export type SignalListener<T> = (value: T) => void;

export interface Signal<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: SignalListener<T>): () => void;
}

export function createSignal<T>(initialValue: T): Signal<T> {
  let currentValue = initialValue;
  const listeners = new Set<SignalListener<T>>();

  return {
    get() {
      return currentValue;
    },
    set(value) {
      if (Object.is(currentValue, value)) {
        return;
      }
      currentValue = value;
      for (const listener of listeners) {
        listener(currentValue);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
