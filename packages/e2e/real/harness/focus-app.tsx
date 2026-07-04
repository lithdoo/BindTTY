import fs from "node:fs";

import { createApp } from "bindtty";
import { Button } from "@bindtty/widgets";
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

const first = createSignal("First");
const second = createSignal("Second");

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
    <Button
      label={first}
      onPress={() => {
        mark("PRESSED:First");
      }}
    />
    <Button
      label={second}
      onPress={() => {
        mark("PRESSED:Second");
        setTimeout(() => {
          app.dispose();
          mark("PASS");
          process.exit(0);
        }, 150);
      }}
    />
  </vstack>,
  { terminal }
);

app.start();

setTimeout(() => {
  mark("READY");
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
