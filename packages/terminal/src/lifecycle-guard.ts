export interface LifecycleGuard {
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface LifecycleGuardOptions {
  restore(): void;
}

type Restore = () => void;
const activeRestores = new Set<Restore>();
const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
let hooksAttached = false;
let restoringForSignal = false;

export function createLifecycleGuard(
  options: LifecycleGuardOptions
): LifecycleGuard {
  let started = false;
  let disposed = false;

  const restore = (): void => {
    if (!started) {
      return;
    }
    started = false;
    activeRestores.delete(restore);
    options.restore();
    detachHooksWhenIdle();
  };

  return {
    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      activeRestores.add(restore);
      attachHooks();
    },
    stop: restore,
    dispose(): void {
      if (disposed) {
        return;
      }
      restore();
      disposed = true;
    }
  };
}

function attachHooks(): void {
  if (hooksAttached) {
    return;
  }
  for (const signal of signals) {
    process.on(signal, handleSignal);
  }
  hooksAttached = true;
}

function detachHooksWhenIdle(): void {
  if (!hooksAttached || activeRestores.size > 0 || restoringForSignal) {
    return;
  }
  for (const signal of signals) {
    process.off(signal, handleSignal);
  }
  hooksAttached = false;
}

function handleSignal(signal: NodeJS.Signals): void {
  if (restoringForSignal) {
    return;
  }
  restoringForSignal = true;
  for (const restore of [...activeRestores]) {
    try {
      restore();
    } catch {
      // Process termination recovery is necessarily best effort.
    }
  }
  restoringForSignal = false;
  detachHooksWhenIdle();

  // Re-deliver after removing our hooks so Node preserves normal signal exit.
  try {
    process.kill(process.pid, signal);
  } catch {
    process.exitCode = 1;
  }
}
