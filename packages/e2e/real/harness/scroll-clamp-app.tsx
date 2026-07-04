import fs from "node:fs";

import { createApp } from "bindtty";
import { VScrollView } from "@bindtty/widgets";
import { createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

import { ptyPlatformAdapter } from "./pty-platform.js";

const markerPath = process.env.BINDTTY_E2E_MARKER;

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

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  fail("NOT_TTY");
}

const offset = createSignal(99);

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
  <VScrollView
    height={2}
    offset={offset}
    onOffsetChange={(nextOffset) => {
      offset.set(nextOffset);
    }}
  >
    <text value="A" />
    <text value="B" />
    <text value="C" />
    <text value="D" />
  </VScrollView>,
  { terminal }
);

app.start();

offset.subscribe((value) => {
  mark(`OFFSET:${value}`);

  if (value === 2) {
    setTimeout(() => {
      app.dispose();
      mark("PASS");
      process.exit(0);
    }, 150);
  }
});

setTimeout(() => {
  mark("READY");
  mark(`OFFSET:${offset.get()}`);
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
