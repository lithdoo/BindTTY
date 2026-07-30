import type { Dispose } from "./types.js";

export type TerminalResponseKind =
  | "kitty-keyboard"
  | "primary-device-attributes"
  | "viewport";

export type TerminalResponse =
  | {
      kind: "kitty-keyboard";
      sequence: string;
      parameters: string;
    }
  | {
      kind: "primary-device-attributes";
      sequence: string;
      parameters: string;
    }
  | {
      kind: "viewport";
      sequence: string;
      rows: number;
      columns: number;
    };

export interface RoutedTerminalInput {
  readonly input: string;
  readonly responses: readonly TerminalResponse[];
}

export interface TerminalResponseRouter {
  expect(kind: TerminalResponseKind): Dispose;
  onInput(listener: (input: string) => void): Dispose;
  onResponse(listener: (response: TerminalResponse) => void): Dispose;
  route(chunk: Buffer | string): RoutedTerminalInput;
  reset(): void;
  dispose(): void;
}

interface ResponseMatcher {
  readonly kind: TerminalResponseKind;
  match(candidate: string): TerminalResponse | undefined;
  isPartial(candidate: string): boolean;
}

export interface TerminalResponseRouterClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface TerminalResponseRouterOptions {
  pendingTimeoutMs?: number;
  clock?: TerminalResponseRouterClock;
}

const systemClock: TerminalResponseRouterClock = {
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
};

const matchers: readonly ResponseMatcher[] = [
  {
    kind: "viewport",
    match(candidate) {
      const match = /^\x1b\[8;(\d+);(\d+)t/.exec(candidate);
      if (!match) {
        return undefined;
      }
      return {
        kind: "viewport",
        sequence: match[0],
        rows: Number(match[1]),
        columns: Number(match[2])
      };
    },
    isPartial: (candidate) =>
      /^\x1b(?:\[(?:8(?:;\d*(?:;\d*)?)?)?)?$/.test(candidate)
  },
  {
    kind: "kitty-keyboard",
    match(candidate) {
      const match = /^\x1b\[\?([0-9;:]*)u/.exec(candidate);
      return match
        ? {
            kind: "kitty-keyboard",
            sequence: match[0],
            parameters: match[1] ?? ""
          }
        : undefined;
    },
    isPartial: (candidate) =>
      /^\x1b(?:\[(?:\?(?:[0-9;:]*)?)?)?$/.test(candidate)
  },
  {
    kind: "primary-device-attributes",
    match(candidate) {
      const match = /^\x1b\[\??([0-9;:]*)c/.exec(candidate);
      return match
        ? {
            kind: "primary-device-attributes",
            sequence: match[0],
            parameters: match[1] ?? ""
          }
        : undefined;
    },
    isPartial: (candidate) =>
      /^\x1b(?:\[(?:\??(?:[0-9;:]*)?)?)?$/.test(candidate)
  }
];

/**
 * Routes terminal query responses before the remaining bytes enter keyboard
 * parsing. Expectations are reference-counted so independent protocol and
 * viewport owners can share one input stream without consuming unsolicited
 * control sequences.
 */
export function createTerminalResponseRouter(
  options: TerminalResponseRouterOptions = {}
): TerminalResponseRouter {
  const expectations = new Map<TerminalResponseKind, number>();
  const inputListeners = new Set<(input: string) => void>();
  const listeners = new Set<(response: TerminalResponse) => void>();
  const clock = options.clock ?? systemClock;
  const pendingTimeoutMs = Math.max(0, options.pendingTimeoutMs ?? 30);
  let pending = "";
  let pendingTimer: unknown;
  let disposed = false;

  function clearPendingTimer(): void {
    if (pendingTimer !== undefined) {
      clock.clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
  }

  function schedulePendingFlush(): void {
    clearPendingTimer();
    pendingTimer = clock.setTimeout(() => {
      pendingTimer = undefined;
      const input = pending;
      pending = "";
      if (input !== "") {
        for (const listener of [...inputListeners]) {
          listener(input);
        }
      }
    }, pendingTimeoutMs);
  }

  const router: TerminalResponseRouter = {
    expect(kind): Dispose {
      if (disposed) {
        return () => {};
      }
      expectations.set(kind, (expectations.get(kind) ?? 0) + 1);
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        const count = expectations.get(kind) ?? 0;
        if (count <= 1) {
          expectations.delete(kind);
        } else {
          expectations.set(kind, count - 1);
        }
      };
    },
    onResponse(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onInput(listener): Dispose {
      if (disposed) {
        return () => {};
      }
      inputListeners.add(listener);
      return () => inputListeners.delete(listener);
    },
    route(chunk): RoutedTerminalInput {
      const incoming = Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : chunk;
      if (disposed || expectations.size === 0) {
        clearPendingTimer();
        const input = pending + incoming;
        pending = "";
        return { input, responses: [] };
      }

      const text = pending + incoming;
      clearPendingTimer();
      const responses: TerminalResponse[] = [];
      pending = "";
      let input = "";
      let offset = 0;

      while (offset < text.length) {
        const escape = text.indexOf("\x1b", offset);
        if (escape < 0) {
          input += text.slice(offset);
          break;
        }
        input += text.slice(offset, escape);
        const candidate = text.slice(escape);
        const activeMatchers = matchers.filter(
          (matcher) => expectations.has(matcher.kind)
        );
        const response = activeMatchers
          .map((matcher) => matcher.match(candidate))
          .find((value) => value !== undefined);
        if (response) {
          responses.push(response);
          offset = escape + response.sequence.length;
          continue;
        }
        if (activeMatchers.some((matcher) => matcher.isPartial(candidate))) {
          pending = candidate;
          schedulePendingFlush();
          break;
        }
        input += "\x1b";
        offset = escape + 1;
      }

      for (const response of responses) {
        for (const listener of [...listeners]) {
          listener(response);
        }
      }
      return { input, responses };
    },
    reset(): void {
      clearPendingTimer();
      pending = "";
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      pending = "";
      clearPendingTimer();
      expectations.clear();
      inputListeners.clear();
      listeners.clear();
      disposed = true;
    }
  };

  return router;
}
