import fs from "node:fs";

import { Button, Textarea, createApp, createSignal } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

import { ptyPlatformAdapter } from "./pty-platform.js";

const markerPath = process.env.BINDTTY_E2E_MARKER;
const expectedValue = "A中B\n下";

function mark(line: string): void {
  if (!markerPath) {
    return;
  }

  fs.appendFileSync(markerPath, `${line}\n`);
}

function fail(reason: string): never {
  mark(`FAIL:${reason}`);
  process.exit(1);
}

function markValue(value: string): void {
  mark(`VALUE:${JSON.stringify(value)}`);
}

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  fail("NOT_TTY");
}

const value = createSignal("");
const committed = createSignal("idle");

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true,
  exitOnCtrlC: false,
  platformAdapter: ptyPlatformAdapter
});

const app = createApp(
  <vstack>
    <Textarea
      value={value}
      placeholder="Body"
      height={3}
      onChange={(next) => {
        value.set(next);
      }}
    />
    <Button
      label="Commit"
      onPress={() => {
        committed.set(value.get());
      }}
    />
    <text value={committed} />
  </vstack>,
  { terminal }
);

value.subscribe((next) => {
  markValue(next);
});

committed.subscribe((next) => {
  mark(`COMMITTED:${JSON.stringify(next)}`);

  if (next === expectedValue) {
    setTimeout(() => {
      app.dispose();
      mark("PASS");
      process.exit(0);
    }, 150);
  }
});

app.start();

setTimeout(() => {
  mark("READY");
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 15_000);
