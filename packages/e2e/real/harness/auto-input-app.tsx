import fs from "node:fs";

import { createApp, createSignal } from "bindtty";
import {
  createNodeTerminal,
  type InputTraceRecord
} from "@bindtty/terminal";
import { Textarea } from "@bindtty/widgets";

const markerPath = process.env.BINDTTY_E2E_MARKER;

function mark(line: string): void {
  if (markerPath) {
    fs.appendFileSync(markerPath, `${line}\n`);
  }
}

function fail(reason: string): never {
  mark(`FAIL:${reason}`);
  process.exit(1);
}

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  fail("NOT_TTY");
}

const value = createSignal("draft");
let backendSeen = false;
const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true,
  exitOnCtrlC: false,
  keyboardProtocol: "legacy",
  inputTrace(record: InputTraceRecord) {
    if (record.recordType === "backend" && record.backend) {
      backendSeen = true;
      mark(`BACKEND:${record.backend.stdinAdapter}:${record.backend.reason}`);
    }
    if (record.recordType === "capabilities" && record.capabilities) {
      mark(`PROTOCOL:${record.capabilities.protocol}`);
    }
  }
});

const app = createApp(
  <Textarea
    value={value}
    onChange={(next) => {
      value.set(next);
      mark(`VALUE:${JSON.stringify(next)}`);
    }}
    onSubmit={(submitted) => {
      mark(`SUBMITTED:${JSON.stringify(submitted)}`);
      if (submitted !== "draft") {
        fail(`F2_MUTATED_VALUE:${JSON.stringify(submitted)}`);
      }
      setTimeout(() => {
        app.dispose();
        mark("PASS");
        process.exit(0);
      }, 100);
    }}
  />,
  { terminal }
);

app.start();

setTimeout(() => {
  if (!backendSeen) {
    fail("MISSING_BACKEND_TRACE");
  }
  mark("READY");
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
