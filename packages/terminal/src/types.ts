import type {
  KeyboardCapabilities
} from "@bindtty/input";

export type Dispose = () => void;

export type ResizeListener = () => void;
export type TerminalKeyListener = (event: TerminalKeyEvent) => void;
export type KeyboardCapabilitiesListener = (
  capabilities: KeyboardCapabilities
) => void;
export type KeyboardProtocolOption =
  | "auto"
  | "kitty"
  | "modify-other-keys"
  | "legacy";

export interface InputTraceRecord {
  time: string;
  adapter: StdinInputKind;
  rawHex?: string;
  rawLength?: number;
  redacted?: "paste";
  event?: Omit<TerminalKeyEvent, "input"> & {
    input?: string;
    inputLength: number;
  };
}

export type InputTraceListener = (record: InputTraceRecord) => void;
export type InputTraceOption = false | string | InputTraceListener;

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
  kind?: "text" | "key" | "paste" | "unknown";
  protocol?: import("@bindtty/input").InputProtocol;
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

export type StdinInputKind = "readline" | "raw" | "win32";

export interface Win32KeyRecord {
  keyDown: boolean;
  virtualKeyCode: number;
  scanCode: number;
  unicode: string;
  controlKeyState: number;
  repeatCount: number;
}

export interface Win32InputProvider {
  attach(listener: (record: Win32KeyRecord) => void): Dispose;
}

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
  /**
   * Selects keyboard input negotiation. `enhancedKeyboard` remains as a
   * deprecated compatibility switch for the previous eager dual-enable mode.
   */
  keyboardProtocol?: KeyboardProtocolOption;
  keyboardProbeTimeoutMs?: number;
  platformAdapter?: PlatformTerminalAdapter;
  stdinInputAdapter?: StdinInputAdapter;
  /** Native Win32 console record source, normally supplied by the optional binding. */
  win32InputProvider?: Win32InputProvider;
  /**
   * Records raw keyboard input for diagnostics. A string is treated as a
   * JSONL file path. Environment fallback: BINDTTY_INPUT_TRACE=1 and optional
   * BINDTTY_INPUT_TRACE_FILE. Paste content is redacted.
   */
  inputTrace?: InputTraceOption;
  /**
   * On Windows, poll stdout columns/rows when the resize event is unreliable.
   * Defaults to 50ms on win32 TTY stdout; set 0 to disable.
   */
  resizePollIntervalMs?: number;
}

export interface TerminalHost {
  readonly viewport: TerminalViewport;
  readonly keyboardCapabilities?: KeyboardCapabilities;

  start(): void;
  stop(): void;
  dispose(): void;

  write(chunk: string): void;

  onResize(listener: ResizeListener): Dispose;
  onKey(listener: TerminalKeyListener): Dispose;
  onKeyboardCapabilitiesChange?(listener: KeyboardCapabilitiesListener): Dispose;
}
