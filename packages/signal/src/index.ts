export type Dispose = () => void;
export type SignalListener<T> = (value: T, previousValue: T) => void;
export type EffectCleanup = void | Dispose;

// ReactiveSource 是“可被追踪的依赖源”。signal 和 computed 都会实现它：
// 当某个 computed/effect 在执行期间读取这个源时，当前 computation 会订阅它。
interface ReactiveSource {
  addSubscriber(subscriber: ReactiveSubscriber): void;
  removeSubscriber(subscriber: ReactiveSubscriber): void;
}

// 内部订阅者不关心新旧值，只关心“依赖变了，需要重新执行”。
type ReactiveSubscriber = () => void;

interface ReactiveComputation {
  // 当前 computation 上一次运行时读取过的所有依赖。
  // 每次重新运行前会清空并重新收集，以支持 if/else 这种动态依赖。
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
  // 重新运行前先解除旧依赖，否则条件分支切换后会继续响应已经不再读取的 signal。
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
      // 用栈而不是单个全局变量，是为了支持 computed/effect 嵌套执行。
      // 栈顶永远是当前正在收集依赖的 computation。
      computationStack.push(computation);
      try {
        runBody();
      } finally {
        // 即使 runBody 抛错，也必须弹栈，否则后续 get() 会被错误地追踪到旧 computation。
        computationStack.pop();
      }
    }
  };

  return computation;
}

function notifySubscribers(subscribers: Set<ReactiveSubscriber>): void {
  // 复制一份再遍历，避免 subscriber 执行时增删订阅者导致本轮通知顺序变得不可预测。
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
      // 如果当前处在 computed/effect 执行中，这次读取会把当前 signal 记录为依赖。
      trackDependency(source);
      return currentValue;
    },
    set(value) {
      if (Object.is(currentValue, value)) {
        return;
      }

      const previousValue = currentValue;
      currentValue = value;
      // 先通知响应式订阅者，让 computed/effect 重新计算；
      // 再通知显式 subscribe(listener)，让用户拿到稳定的新旧值。
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
      // computed 初次求值只是建立缓存和依赖，不应触发订阅者。
      // 只有后续依赖变化且派生值真的改变时，才向下游传播。
      notifySubscribers(subscribers);
      notifyListeners(listeners, currentValue, previousValue);
    }
  });

  // 创建 computed 时立即求值，这样它会马上收集依赖并拥有可同步读取的缓存值。
  computation.run();

  return {
    get() {
      // computed 本身也可以作为另一个 computed/effect 的依赖源。
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
      // effect 重新运行前先清理上一次运行创建的外部资源。
      cleanup();
      cleanup = undefined;
    }
    cleanup = runEffect();
  });

  // effect 的语义是“立即运行一次”，并在运行期间收集依赖。
  computation.run();

  return () => {
    if (computation.disposed) {
      return;
    }

    computation.disposed = true;
    cleanupDependencies(computation);
    if (cleanup) {
      // dispose 时也要执行最后一次 cleanup，防止事件监听、定时器等资源泄漏。
      cleanup();
      cleanup = undefined;
    }
  };
}
