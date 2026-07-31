import type { Dispose } from "./types.js";

interface RefreshableStdio {
  _refreshSize?: (...args: unknown[]) => unknown;
}

interface StreamGuardState {
  references: number;
  original: (...args: unknown[]) => unknown;
  guarded: (...args: unknown[]) => unknown;
}

export interface WindowsStdioResizeGuardOptions {
  platform?: NodeJS.Platform;
  stdout?: RefreshableStdio;
  stderr?: RefreshableStdio;
}

const streamGuards = new WeakMap<RefreshableStdio, StreamGuardState>();

function isGetWindowSizeEpipe(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as NodeJS.ErrnoException;
  if (candidate.code !== "EPIPE") {
    return false;
  }

  return (
    candidate.syscall === "getWindowSize" ||
    String(candidate.message).includes("getWindowSize")
  );
}

function acquireStreamGuard(stream: RefreshableStdio | undefined): Dispose {
  if (!stream || typeof stream._refreshSize !== "function") {
    return () => {};
  }

  const current = streamGuards.get(stream);
  if (current) {
    current.references += 1;
    return createRelease(stream, current);
  }

  const original = stream._refreshSize;
  const state: StreamGuardState = {
    references: 1,
    original,
    guarded: function guardedRefreshSize(
      this: RefreshableStdio,
      ...args: unknown[]
    ): unknown {
      try {
        return Reflect.apply(original, this, args);
      } catch (error) {
        if (isGetWindowSizeEpipe(error)) {
          return undefined;
        }
        throw error;
      }
    }
  };

  stream._refreshSize = state.guarded;
  streamGuards.set(stream, state);
  return createRelease(stream, state);
}

function createRelease(
  stream: RefreshableStdio,
  state: StreamGuardState
): Dispose {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    state.references -= 1;
    if (state.references > 0) {
      return;
    }

    if (stream._refreshSize === state.guarded) {
      stream._refreshSize = state.original;
    }
    streamGuards.delete(stream);
  };
}

/**
 * Node refreshes both stdout and stderr synchronously for every SIGWINCH.
 * On Windows, a transient getWindowSize EPIPE can escape that internal
 * listener while the console host is being resized. Guard only that known
 * failure and preserve every other exception.
 */
export function acquireWindowsStdioResizeGuard(
  options: WindowsStdioResizeGuardOptions = {}
): Dispose {
  if ((options.platform ?? process.platform) !== "win32") {
    return () => {};
  }

  const releaseStdout = acquireStreamGuard(
    options.stdout ?? (process.stdout as unknown as RefreshableStdio)
  );
  const releaseStderr = acquireStreamGuard(
    options.stderr ?? (process.stderr as unknown as RefreshableStdio)
  );
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseStderr();
    releaseStdout();
  };
}
