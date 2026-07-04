import fs from "node:fs";

import { createApp } from "bindtty";
import { Button } from "@bindtty/widgets";
import { createSignal, computed } from "@bindtty/signal";
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

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

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
    <text value={label} />
    <Button
      label="+"
      onPress={() => {
        count.set(count.get() + 1);
      }}
    />
  </vstack>,
  { terminal }
);

app.start();

mark(`COUNT:${count.get()}`);
mark("READY");

count.subscribe((value) => {
  mark(`COUNT:${value}`);

  if (value === 1) {
    setTimeout(() => {
      app.dispose();
      mark("PASS");
      process.exit(0);
    }, 150);
  }
});

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
