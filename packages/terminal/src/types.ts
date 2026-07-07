export type Dispose = () => void;

export type ResizeListener = () => void;
export type TerminalKeyListener = (event: TerminalKeyEvent) => void;

export interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
}

export type KeypressListener = (
  input: string | undefined,
  key: KeypressKey | undefined
) => void;

export interface TerminalStdout {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(chunk: string): unknown;
  on?(event: "resize", listener: ResizeListener): unknown;
  off?(event: "resize", listener: ResizeListener): unknown;
}

export interface TerminalStdin {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
  resume?(): unknown;
  pause?(): unknown;
  on?(event: "keypress", listener: KeypressListener): unknown;
  off?(event: "keypress", listener: KeypressListener): unknown;
}

export interface TerminalViewport {
  width: number;
  height: number;
}

export interface TerminalKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}

export interface PlatformTerminalAdapter {
  readonly name: string;

  createStdinInput(options: CreateNodeTerminalOptions): StdinInputAdapter;
}

export type StdinInputKind = "readline" | "raw";

export interface StdinInputAdapter {
  readonly kind: StdinInputKind;

  prepare(stdin: import("node:stream").Readable): void;

  attach(
    stdin: import("node:stream").Readable,
    onKey: (event: TerminalKeyEvent) => void
  ): Dispose;
}

export interface CreateNodeTerminalOptions {
  stdout: TerminalStdout;
  stdin?: TerminalStdin;
  fallbackViewport?: TerminalViewport;
  useAltScreen?: boolean;
  hideCursor?: boolean;
  rawMode?: boolean;
  exitOnCtrlC?: boolean;
  enhancedKeyboard?: boolean;
  platformAdapter?: PlatformTerminalAdapter;
  stdinInputAdapter?: StdinInputAdapter;
  /**
   * On Windows, poll stdout columns/rows when the resize event is unreliable.
   * Defaults to 50ms on win32 TTY stdout; set 0 to disable.
   */
  resizePollIntervalMs?: number;
}

export interface TerminalHost {
  readonly viewport: TerminalViewport;

  start(): void;
  stop(): void;
  dispose(): void;

  write(chunk: string): void;

  onResize(listener: ResizeListener): Dispose;
  onKey(listener: TerminalKeyListener): Dispose;
}
