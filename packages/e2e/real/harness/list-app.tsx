import fs from "node:fs";

import { List, createApp } from "bindtty";
import { createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

import { ptyPlatformAdapter } from "./pty-platform.js";

const markerPath = process.env.BINDTTY_E2E_MARKER;

interface Row {
  id: number;
  label: string;
}

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

const offset = createSignal(0);
const items = createSignal<readonly Row[]>([
  { id: 1, label: "A" },
  { id: 2, label: "B" },
  { id: 3, label: "C" },
  { id: 4, label: "D" }
]);

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
  <List
    height={2}
    offset={offset}
    items={items}
    getKey={(item) => (item as Row).id}
    render={(item) => <text value={(item as Row).label} />}
    onOffsetChange={(nextOffset) => {
      offset.set(nextOffset);
    }}
  />,
  { terminal }
);

app.start();

offset.subscribe((value) => {
  mark(`OFFSET:${value}`);

  if (value === 1) {
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
