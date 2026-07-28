import type {
  KeyboardCapabilities,
  SemanticInputEvent
} from "@bindtty/input";

export type Dispose = () => void;

export type ResizeListener = (event: TerminalResizeEvent) => void;
export type TerminalKeyListener = (event: TerminalKeyEvent) => void;
export type KeyboardCapabilitiesListener = (
  capabilities: KeyboardCapabilities
) => void;
export type KeyboardProtocolOption =
  | "auto"
  | "kitty"
  | "modify-other-keys"
  | "legacy";
export type InputBackendOption = "auto" | "readline" | "raw" | "win32";

export interface TerminalInputEnvironment {
  platform: NodeJS.Platform;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  canSetRawMode: boolean;
  isProcessStdin: boolean;
  windowsTerminal: boolean;
  conEmu: boolean;
  ansicon: boolean;
  terminalProgram?: string;
  term?: string;
}

export interface InputBackendSelection {
  stdinAdapter: StdinInputKind;
  reason:
    | "explicit-stdin-input-adapter"
    | "explicit-readline-backend"
    | "explicit-raw-backend"
    | "explicit-win32-backend"
    | "explicit-win32-backend-unavailable; using-raw-stdin"
    | "explicit-win32-backend-unavailable; using-readline"
    | "win32-input-provider-available"
    | "tty-raw-input-available"
    | "raw-mode-requested"
    | "raw-mode-disabled"
    | "non-tty-readline-fallback";
  enableRawMode: boolean;
}

export interface InputTraceEnvironment {
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  rawModeRequested: boolean;
  inputBackendRequested: InputBackendOption;
  keyboardProtocolRequested: KeyboardProtocolOption | "default";
  terminalProgram?: string;
  term?: string;
  windowsTerminal: boolean;
  conEmu: boolean;
  ansicon: boolean;
  ci: boolean;
  captureShell?: string;
  captureShellVersion?: string;
  captureHost?: string;
}

export interface InputTraceBackendSelection {
  platformAdapter: string;
  stdinAdapter: StdinInputKind;
  reason: string;
}

export interface InputTraceWin32Record {
  keyDown: boolean;
  virtualKeyCode: number;
  scanCode: number;
  unicodeCodeUnits: number[];
  controlKeyState: number;
  repeatCount: number;
}

export interface InputTraceCaptureMarker {
  expected: string;
  phase: "begin" | "observed" | "skipped";
  observedEvent?: {
    kind: TerminalKeyEvent["kind"];
    protocol: TerminalKeyEvent["protocol"];
    key?: import("@bindtty/input").KeyName;
    modifiers?: import("@bindtty/input").KeyModifiers;
    textLength?: number;
  };
}

export interface InputTraceRecord {
  time: string;
  recordType: "environment" | "backend" | "capabilities" | "raw" | "win32-record" | "event" | "capture-marker";
  adapter?: StdinInputKind;
  environment?: InputTraceEnvironment;
  backend?: InputTraceBackendSelection;
  capabilities?: KeyboardCapabilities;
  rawHex?: string;
  rawLength?: number;
  win32Record?: InputTraceWin32Record;
  captureMarker?: InputTraceCaptureMarker;
  redacted?: "paste";
  event?: {
    kind: TerminalKeyEvent["kind"];
    protocol: TerminalKeyEvent["protocol"];
    key?: import("@bindtty/input").KeyName;
    modifiers?: import("@bindtty/input").KeyModifiers;
    repeat?: number;
    text?: string;
    textLength?: number;
    raw?: string;
    rawLength?: number;
    reason?: string;
    sequence?: string;
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
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
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

export interface TerminalResizeEvent {
  readonly viewport: TerminalViewport;
  readonly previousViewport: TerminalViewport;
  readonly source: "event" | "poll";
}

export type TerminalKeyEvent = SemanticInputEvent;

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
  /** Allows optional native bindings to reject redirected/non-console stdin. */
  isAvailable?(): boolean;
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
  /**
   * Selects the stdin backend. The default `auto` policy keeps this decision
   * inside terminal: native Win32 records first, then raw TTY input, then
   * readline. `rawMode` remains a compatibility override.
   */
  inputBackend?: InputBackendOption;
  exitOnCtrlC?: boolean;
  enhancedKeyboard?: boolean;
  /**
   * Selects keyboard input negotiation. Defaults to `auto`: raw VT input
   * probes Kitty with a query plus primary DA and otherwise falls back to the
   * backend protocol. modifyOtherKeys is enabled only by an explicit option.
   * `enhancedKeyboard` remains as a deprecated compatibility switch for the
   * previous eager dual-enable mode.
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
   * Poll stdout columns/rows as a fallback alongside resize events.
   * Defaults to 50ms on win32 TTY stdout; set 0 to disable the fallback.
   */
  resizePollIntervalMs?: number;
  /**
   * Minimum interval between viewport publications during a resize burst.
   * Defaults to 32ms on win32 and 0 elsewhere; set 0 to publish immediately.
   */
  resizeMinFrameIntervalMs?: number;
  /**
   * Publishes the latest pending viewport after resize activity settles.
   * Defaults to 100ms on win32 and 0 elsewhere.
   */
  resizeSettleDelayMs?: number;
}

export interface TerminalHost {
  readonly viewport: TerminalViewport;
  readonly keyboardCapabilities?: KeyboardCapabilities;

  start(): void;
  stop(): void;
  dispose(): void;

  /**
   * Returns false when the underlying stdout accepted the chunk but requires
   * callers to wait for drain before writing another frame.
   */
  write(chunk: string): boolean | void;

  onResize(listener: ResizeListener): Dispose;
  onDrain?(listener: () => void): Dispose;
  onKey(listener: TerminalKeyListener): Dispose;
  onKeyboardCapabilitiesChange?(listener: KeyboardCapabilitiesListener): Dispose;
}
