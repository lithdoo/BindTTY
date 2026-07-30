import fs from "node:fs";
import path from "node:path";

const recordTypes = new Set([
  "environment",
  "backend",
  "capabilities",
  "raw",
  "win32-record",
  "event",
  "capture-marker"
]);

export const captureSteps = [
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
  "text emoji",
  "paste BINDTTY_PASTE_SAMPLE"
];

export const requiredFixtureNames = [
  "powershell-5.1-windows-terminal.jsonl",
  "powershell-7-windows-terminal.jsonl",
  "powershell-5.1-console-host.jsonl",
  "powershell-7-console-host.jsonl"
];

const mandatoryObservedSteps = new Set([
  "F2",
  "Enter",
  "Ctrl+Enter",
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
  "text emoji",
  "paste BINDTTY_PASTE_SAMPLE"
]);

export function readFixture(path) {
  const source = fs.readFileSync(path, "utf8");
  const records = [];

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (line.trim() === "") {
      continue;
    }

    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }

  return records;
}

export function validateFixture(records, label = "fixture") {
  const errors = [];

  if (records.length === 0) {
    errors.push(`${label}: fixture is empty`);
    return errors;
  }

  for (const [index, record] of records.entries()) {
    const location = `${label}:${index + 1}`;
    if (typeof record.time !== "string" || Number.isNaN(Date.parse(record.time))) {
      errors.push(`${location}: time must be an ISO timestamp`);
    }
    if (!recordTypes.has(record.recordType)) {
      errors.push(`${location}: unsupported recordType ${JSON.stringify(record.recordType)}`);
    }
    if (record.redacted === "paste") {
      if (record.rawHex !== undefined) {
        errors.push(`${location}: redacted paste must not contain rawHex`);
      }
      if (record.event?.text !== undefined) {
        errors.push(`${location}: redacted paste must not contain event.text`);
      }
      if (record.win32Record?.unicodeCodeUnits?.length > 0) {
        errors.push(`${location}: redacted paste must not contain Unicode code units`);
      }
    }
  }

  requireRecord(records, "environment", errors, label);
  requireRecord(records, "backend", errors, label);
  requireRecord(records, "capabilities", errors, label);
  requireRecord(records, "event", errors, label);
  if (!records.some((record) =>
    record.recordType === "raw" || record.recordType === "win32-record"
  )) {
    errors.push(`${label}: missing raw or win32-record input evidence`);
  }

  const environment = records.find((record) => record.recordType === "environment")?.environment;
  if (environment?.platform !== "win32") {
    errors.push(`${label}: environment.platform must be win32`);
  }
  if (
    !environment?.captureShell ||
    !environment?.captureShellVersion ||
    !environment?.captureHost
  ) {
    errors.push(`${label}: capture shell and host metadata is required`);
  } else {
    validateEnvironmentMatrix(environment, errors, label);
    const expectedFixtureName =
      `${environment.captureShell}-${environment.captureHost}.jsonl`;
    if (
      label !== "fixture" &&
      label.endsWith(".jsonl") &&
      path.basename(label) !== expectedFixtureName
    ) {
      errors.push(
        `${label}: filename must match captured environment ${expectedFixtureName}`
      );
    }
  }

  const backend = records.find((record) => record.recordType === "backend")?.backend;
  if (!backend?.platformAdapter || !backend?.stdinAdapter || !backend?.reason) {
    errors.push(`${label}: backend selection metadata is incomplete`);
  }
  if (
    backend?.stdinAdapter !== "win32" ||
    backend?.reason !== "win32-input-provider-available"
  ) {
    errors.push(`${label}: M7 release fixtures must exercise the auto-selected native Win32 backend`);
  }
  const protocol = records.find((record) =>
    record.recordType === "capabilities"
  )?.capabilities?.protocol;
  if (backend?.stdinAdapter === "win32" && protocol !== "win32") {
    errors.push(`${label}: win32 backend must report win32 capabilities`);
  }

  validateCaptureMarkers(records, errors, label);

  return errors;
}

function requireRecord(records, type, errors, label) {
  if (!records.some((record) => record.recordType === type)) {
    errors.push(`${label}: missing ${type} record`);
  }
}

function validateCaptureMarkers(records, errors, label) {
  const begins = records
    .filter((record) =>
      record.recordType === "capture-marker" &&
      record.captureMarker?.phase === "begin"
    )
    .map((record) => record.captureMarker.expected);
  const results = records
    .filter((record) =>
      record.recordType === "capture-marker" &&
      (record.captureMarker?.phase === "observed" ||
        record.captureMarker?.phase === "skipped")
    )
    .map((record) => record.captureMarker.expected);

  if (begins.length === 0) {
    errors.push(`${label}: missing guided capture markers`);
    return;
  }
  if (JSON.stringify(begins) !== JSON.stringify(captureSteps)) {
    errors.push(`${label}: guided capture steps do not match the required M7 matrix`);
  }
  if (begins.length !== results.length) {
    errors.push(
      `${label}: every guided capture step must be observed or explicitly skipped`
    );
  }
  if (JSON.stringify(begins) !== JSON.stringify(results)) {
    errors.push(`${label}: guided capture marker order is inconsistent`);
  }

  for (const record of records) {
    if (
      record.recordType !== "capture-marker" ||
      record.captureMarker?.phase !== "observed"
    ) {
      continue;
    }
    validateObservedEvent(
      record.captureMarker.expected,
      record.captureMarker.observedEvent,
      errors,
      label
    );
  }

  for (const record of records) {
    if (
      record.recordType === "capture-marker" &&
      record.captureMarker?.phase === "skipped" &&
      mandatoryObservedSteps.has(record.captureMarker.expected)
    ) {
      errors.push(
        `${label}: mandatory step ${record.captureMarker.expected} cannot be skipped`
      );
    }
  }
}

function validateObservedEvent(expected, event, errors, label) {
  if (!event) {
    errors.push(`${label}: ${expected} observed marker is missing event evidence`);
    return;
  }

  if (expected === "text emoji") {
    if (event.kind !== "text" || !(event.textLength >= 2)) {
      errors.push(
        `${label}: text emoji must be a text event with UTF-16 length >= 2`
      );
    }
    return;
  }

  if (expected.startsWith("text ")) {
    const text = expected.slice("text ".length);
    if (event.kind !== "text" || event.textLength !== text.length) {
      errors.push(`${label}: ${expected} must be a text event of length ${text.length}`);
    }
    return;
  }

  if (expected === "paste BINDTTY_PASTE_SAMPLE") {
    if (
      (event.kind !== "text" && event.kind !== "paste") ||
      event.textLength !== "BINDTTY_PASTE_SAMPLE".length
    ) {
      errors.push(`${label}: paste sample must be captured completely and redacted`);
    }
    return;
  }

  const expectedKey = expectedKeyEvent(expected);
  if (!expectedKey) {
    errors.push(`${label}: no semantic expectation is defined for ${expected}`);
    return;
  }
  if (
    event.kind !== "key" ||
    event.key !== expectedKey.key ||
    !sameModifiers(event.modifiers, expectedKey.modifiers)
  ) {
    errors.push(`${label}: ${expected} observed semantic event does not match`);
  }
}

function expectedKeyEvent(expected) {
  const functionMatch = expected.match(/^(?:(Shift|Ctrl|Alt)\+)?F(\d+)$/);
  if (functionMatch) {
    return {
      key: `f${Number(functionMatch[2])}`,
      modifiers: modifiersFor(functionMatch[1])
    };
  }

  const modifierMatch = expected.match(/^(Ctrl|Alt)\+(.+)$/);
  const modifier = modifierMatch?.[1];
  const name = modifierMatch?.[2] ?? expected;
  const keyNames = {
    Enter: "enter",
    Up: "up",
    Down: "down",
    Left: "left",
    Right: "right",
    Backspace: "backspace",
    Delete: "delete",
    Tab: "tab"
  };

  if (expected === "Shift+Tab") {
    return { key: "tab", modifiers: modifiersFor("Shift") };
  }
  if (!keyNames[name]) {
    return null;
  }
  return { key: keyNames[name], modifiers: modifiersFor(modifier) };
}

function modifiersFor(modifier) {
  return {
    ctrl: modifier === "Ctrl",
    alt: modifier === "Alt",
    shift: modifier === "Shift",
    meta: false
  };
}

function sameModifiers(actual, expected) {
  return actual &&
    actual.ctrl === expected.ctrl &&
    actual.alt === expected.alt &&
    actual.shift === expected.shift &&
    actual.meta === expected.meta;
}

function validateEnvironmentMatrix(environment, errors, label) {
  if (!["powershell-5.1", "powershell-7"].includes(environment.captureShell)) {
    errors.push(`${label}: unsupported capture shell ${environment.captureShell}`);
  }
  if (!["windows-terminal", "console-host"].includes(environment.captureHost)) {
    errors.push(`${label}: unsupported capture host ${environment.captureHost}`);
  }
  if (
    environment.captureShell === "powershell-5.1" &&
    !environment.captureShellVersion.startsWith("5.1")
  ) {
    errors.push(`${label}: PowerShell 5.1 fixture has an inconsistent version`);
  }
  if (
    environment.captureShell === "powershell-7" &&
    !environment.captureShellVersion.startsWith("7.")
  ) {
    errors.push(`${label}: PowerShell 7 fixture has an inconsistent version`);
  }
  if (
    environment.captureHost === "windows-terminal" &&
    environment.windowsTerminal !== true
  ) {
    errors.push(`${label}: Windows Terminal capture must report windowsTerminal=true`);
  }
  if (
    environment.captureHost === "console-host" &&
    environment.windowsTerminal !== false
  ) {
    errors.push(`${label}: Console Host capture must report windowsTerminal=false`);
  }
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}
