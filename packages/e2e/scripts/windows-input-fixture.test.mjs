import assert from "node:assert/strict";
import test from "node:test";

import {
  captureSteps,
  validateFixture
} from "./windows-input-fixture.mjs";

const baseRecords = [
  {
    time: "2026-01-01T00:00:00.000Z",
    recordType: "environment",
    environment: {
      platform: "win32",
      inputBackendRequested: "auto",
      captureShell: "powershell-7",
      captureShellVersion: "7.5.0",
      captureHost: "windows-terminal",
      windowsTerminal: true
    }
  },
  {
    time: "2026-01-01T00:00:00.001Z",
    recordType: "backend",
    backend: {
      platformAdapter: "win32",
      stdinAdapter: "win32",
      reason: "win32-input-provider-available"
    }
  },
  {
    time: "2026-01-01T00:00:00.002Z",
    recordType: "capabilities",
    capabilities: {
      protocol: "win32"
    }
  },
  {
    time: "2026-01-01T00:00:00.003Z",
    recordType: "win32-record",
    adapter: "win32",
    win32Record: {
      keyDown: true,
      virtualKeyCode: 113,
      scanCode: 60,
      unicodeCodeUnits: [],
      controlKeyState: 0,
      repeatCount: 1
    }
  },
  {
    time: "2026-01-01T00:00:00.004Z",
    recordType: "event",
    event: {
      kind: "key",
      protocol: "windows-vt",
      key: "f2",
      modifiers: {
        ctrl: false,
        alt: false,
        shift: false,
        meta: false
      },
      repeat: 1
    }
  }
];

test("accepts a complete semantically valid Windows input fixture", () => {
  assert.deepEqual(
    validateFixture([
      ...baseRecords,
      ...captureSteps.flatMap((expected, index) => [
        captureMarker(expected, "begin", undefined, index),
        captureMarker(expected, "observed", observedEvent(expected), index)
      ])
    ]),
    []
  );
});

test("rejects paste plaintext and missing required records", () => {
  const errors = validateFixture([
    {
      time: "2026-01-01T00:00:00.000Z",
      recordType: "raw",
      redacted: "paste",
      rawHex: "736563726574"
    }
  ]);

  assert.ok(errors.some((error) => error.includes("must not contain rawHex")));
  assert.ok(errors.some((error) => error.includes("missing environment")));
  assert.ok(errors.some((error) => error.includes("missing event")));
});

test("rejects incomplete matrices and semantic key mismatches", () => {
  const records = [
    ...baseRecords,
    captureMarker("F2", "begin", undefined, 0),
    captureMarker("F2", "observed", {
      kind: "text",
      protocol: "win32",
      textLength: 1
    }, 0)
  ];
  const errors = validateFixture(records);

  assert.ok(errors.some((error) => error.includes("required M7 matrix")));
  assert.ok(errors.some((error) => error.includes("F2 observed semantic event does not match")));
});

test("rejects fallback backends and skipped mandatory steps", () => {
  const records = [
    ...baseRecords.map((record) =>
      record.recordType === "backend"
        ? {
            ...record,
            backend: {
              ...record.backend,
              stdinAdapter: "raw",
              reason: "tty-raw-input-available"
            }
          }
        : record
    ),
    ...captureSteps.flatMap((expected, index) => [
      captureMarker(expected, "begin", undefined, index),
      expected === "Ctrl+Enter"
        ? captureMarker(expected, "skipped", undefined, index)
        : captureMarker(expected, "observed", observedEvent(expected), index)
    ])
  ];
  const errors = validateFixture(records);

  assert.ok(errors.some((error) => error.includes("auto-selected native Win32 backend")));
  assert.ok(errors.some((error) => error.includes("Ctrl+Enter cannot be skipped")));
});

function captureMarker(expected, phase, event, index) {
  return {
    time: new Date(Date.UTC(2026, 0, 1, 0, 1, index)).toISOString(),
    recordType: "capture-marker",
    captureMarker: {
      expected,
      phase,
      ...(event ? { observedEvent: event } : {})
    }
  };
}

function observedEvent(expected) {
  const base = {
    protocol: "win32",
    modifiers: {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    }
  };

  if (expected.startsWith("text ")) {
    return {
      kind: "text",
      protocol: "win32",
      textLength: expected.slice("text ".length).length
    };
  }
  if (expected.startsWith("paste ")) {
    return {
      kind: "text",
      protocol: "win32",
      textLength: "BINDTTY_PASTE_SAMPLE".length
    };
  }

  const functionMatch = expected.match(/^(?:(Shift|Ctrl|Alt)\+)?F(\d+)$/);
  if (functionMatch) {
    return {
      kind: "key",
      protocol: "win32",
      key: `f${Number(functionMatch[2])}`,
      modifiers: {
        ...base.modifiers,
        shift: functionMatch[1] === "Shift",
        ctrl: functionMatch[1] === "Ctrl",
        alt: functionMatch[1] === "Alt"
      }
    };
  }

  const labels = expected.split("+");
  const keyLabel = labels.at(-1);
  const names = {
    Enter: "enter",
    Up: "up",
    Down: "down",
    Left: "left",
    Right: "right",
    Backspace: "backspace",
    Delete: "delete",
    Tab: "tab"
  };
  return {
    kind: "key",
    protocol: "win32",
    key: names[keyLabel],
    modifiers: {
      ...base.modifiers,
      ctrl: labels.includes("Ctrl"),
      alt: labels.includes("Alt"),
      shift: labels.includes("Shift")
    }
  };
}
