import fs from "node:fs";

import { ScrollView, createApp } from "bindtty";
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

const offset = createSignal(0);

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
  <vstack gap={1}>
    <text value="宽字符标题🙂" bold />
    <ScrollView
      height={2}
      offset={offset}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    >
      <text value="甲" />
      <text value="乙" />
      <text value="丙" />
      <text value="丁" />
    </ScrollView>
  </vstack>,
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
  mark("TITLE:宽字符标题🙂");
  mark(`OFFSET:${offset.get()}`);
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
