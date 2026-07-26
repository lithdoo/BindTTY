import { appendFileSync } from "node:fs";

import {
  createNodeTerminal,
  type InputTraceRecord,
  type TerminalKeyEvent
} from "@bindtty/terminal";

function runCapture(): void {
  const tracePath = process.env.BINDTTY_INPUT_TRACE_FILE;
  if (!tracePath) {
    throw new Error("BINDTTY_INPUT_TRACE_FILE is required for capture.");
  }
  let stepIndex = 0;
  let pasteText = "";
  const writeRecord = (record: InputTraceRecord): void => {
    appendFileSync(
      tracePath,
      `${JSON.stringify(redactPasteRecord(record, captureSteps[stepIndex]))}\n`,
      "utf8"
    );
  };
  const terminal = createNodeTerminal({
    stdin: process.stdin,
    stdout: process.stdout,
    rawMode: true,
    exitOnCtrlC: false,
    keyboardProtocol: "auto",
    inputTrace: writeRecord
  });
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    terminal.dispose();
    process.stdin.pause();
    process.stdout.write("\nCapture complete.\n");
  };

  terminal.onKey((event) => {
    const expected = captureSteps[stepIndex];
    if (!expected) {
      return;
    }

    if (isSkipKey(event)) {
      writeCaptureMarker(writeRecord, expected, "skipped");
      pasteText = "";
      stepIndex += 1;
      promptForStep(stepIndex);
      return;
    }

    if (expected === pasteStep) {
      if (event.kind !== "text" && event.kind !== "paste") {
        writeCaptureMarker(writeRecord, expected, "observed", event);
        stepIndex += 1;
        promptForStep(stepIndex);
        return;
      }

      pasteText += event.text;
      if (pasteSample.startsWith(pasteText) && pasteText !== pasteSample) {
        return;
      }

      writePasteCaptureMarker(
        writeRecord,
        event.protocol,
        event.kind,
        pasteText.length
      );
      pasteText = "";
      stepIndex += 1;
      if (stepIndex >= captureSteps.length) {
        dispose();
        return;
      }
      promptForStep(stepIndex);
      return;
    }

    writeCaptureMarker(writeRecord, expected, "observed", event);
    process.stdout.write(`${formatEvent(event)}\n`);
    stepIndex += 1;
    if (stepIndex >= captureSteps.length) {
      dispose();
      return;
    }
    promptForStep(stepIndex);
  });

  process.once("exit", dispose);
  process.once("SIGINT", dispose);

  process.stdout.write([
    "BindTTY Windows input capture",
    `trace=${tracePath}`,
    "",
    "Press the requested physical key once.",
    "Press Ctrl+G to mark a host-reserved or unavailable key as skipped.",
    "Do not type passwords or other sensitive text.",
    ""
  ].join("\n"));

  terminal.start();
  promptForStep(stepIndex);

  function promptForStep(index: number): void {
    const expected = captureSteps[index];
    if (!expected) {
      return;
    }
    writeCaptureMarker(writeRecord, expected, "begin");
    process.stdout.write(
      `[${index + 1}/${captureSteps.length}] Press ${expected} (Ctrl+G skips): `
    );
  }
}

const pasteSample = "BINDTTY_PASTE_SAMPLE";
const pasteStep = `paste ${pasteSample}`;

function redactPasteRecord(
  record: InputTraceRecord,
  expected: string | undefined
): InputTraceRecord {
  if (expected !== pasteStep) {
    return record;
  }

  if (record.recordType === "raw") {
    const { rawHex: _rawHex, ...safe } = record;
    return { ...safe, redacted: "paste" };
  }

  if (record.recordType === "win32-record" && record.win32Record) {
    return {
      ...record,
      redacted: "paste",
      win32Record: {
        ...record.win32Record,
        unicodeCodeUnits: []
      }
    };
  }

  if (record.recordType === "event" && record.event) {
    const { text: _text, ...safeEvent } = record.event;
    return {
      ...record,
      redacted: "paste",
      event: {
        ...safeEvent,
        sequence: "[redacted-paste]"
      }
    };
  }

  return record;
}

function writePasteCaptureMarker(
  writeRecord: (record: InputTraceRecord) => void,
  protocol: TerminalKeyEvent["protocol"],
  kind: "text" | "paste",
  textLength: number
): void {
  writeRecord({
    time: new Date().toISOString(),
    recordType: "capture-marker",
    captureMarker: {
      expected: pasteStep,
      phase: "observed",
      observedEvent: {
        kind,
        protocol,
        textLength
      }
    }
  });
}

function isSkipKey(event: TerminalKeyEvent): boolean {
  return (
    event.kind === "key" &&
    event.modifiers.ctrl &&
    event.key === "g"
  );
}

function formatEvent(event: TerminalKeyEvent): string {
  const modifiers = event.kind === "key"
    ? event.modifiers
    : { ctrl: false, alt: false, meta: false, shift: false };
  const modifierLabels = [
    modifiers.ctrl ? "ctrl" : "",
    modifiers.alt ? "alt" : "",
    modifiers.meta && !modifiers.alt ? "meta" : "",
    modifiers.shift ? "shift" : ""
  ].filter(Boolean);

  return [
    `kind=${event.kind}`,
    `protocol=${event.protocol}`,
    `key=${event.kind === "key" ? event.key : "-"}`,
    `modifiers=${modifierLabels.join("+") || "-"}`,
    `textLength=${event.kind === "text" || event.kind === "paste" ? event.text.length : 0}`
  ].join(" ");
}

function writeCaptureMarker(
  writeRecord: (record: InputTraceRecord) => void,
  expected: string,
  phase: "begin" | "observed" | "skipped",
  event?: TerminalKeyEvent
): void {
  writeRecord({
    time: new Date().toISOString(),
    recordType: "capture-marker",
    captureMarker: {
      expected,
      phase,
      ...(event === undefined
        ? {}
        : {
            observedEvent: {
              kind: event.kind,
              protocol: event.protocol,
              ...(event.kind === "key"
                ? {
                    key: event.key,
                    modifiers: event.modifiers
                  }
                : {}),
              ...(event.kind === "text" || event.kind === "paste"
                ? { textLength: event.text.length }
                : {})
            }
          })
    }
  });
}

const captureSteps = [
  ...range(1, 24).map((number) => `F${number}`),
  ...["Shift", "Ctrl", "Alt"].flatMap((modifier) =>
    range(1, 12).map((number) => `${modifier}+F${number}`)
  ),
  "Enter",
  "Ctrl+Enter",
  "Alt+Enter",
  "Up",
  "Down",
  "Left",
  "Right",
  "Ctrl+Up",
  "Ctrl+Down",
  "Ctrl+Left",
  "Ctrl+Right",
  "Backspace",
  "Delete",
  "Tab",
  "Shift+Tab",
  "text A",
  "text 中",
  "text 🙂",
  pasteStep
] as const;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

if (process.platform !== "win32") {
  console.error("Windows input capture must run on a native Windows host.");
  process.exitCode = 1;
} else if (process.env.BINDTTY_INPUT_TRACE !== "1") {
  console.error("BINDTTY_INPUT_TRACE=1 is required for capture.");
  process.exitCode = 1;
} else {
  runCapture();
}
