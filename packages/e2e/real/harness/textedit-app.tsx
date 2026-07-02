import fs from "node:fs";

import { createApp, TextInput } from "bindtty";
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

const value = createSignal("");
const submitted = createSignal("idle");

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
    <TextInput
      value={value}
      placeholder="Name"
      onChange={(next) => {
        value.set(next);
      }}
      onSubmit={(next) => {
        submitted.set(`sent:${next}`);
      }}
    />
    <text value={submitted} />
  </vstack>,
  { terminal }
);

submitted.subscribe((next) => {
  mark(`SUBMITTED:${next}`);

  if (next === "sent:a") {
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
