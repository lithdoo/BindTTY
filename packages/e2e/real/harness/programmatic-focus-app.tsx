import fs from "node:fs";

import { createApp } from "bindtty";
import { createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";
import type { MountedElementApi } from "@bindtty/vnode";

import { ptyPlatformAdapter } from "./pty-platform.js";

const markerPath = process.env.BINDTTY_E2E_MARKER;
const mode = process.env.BINDTTY_FOCUS_MODE === "ref" ? "ref" : "app";

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
let secondApi: MountedElementApi | undefined;

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
    <text
      id="first"
      value={first}
      onKey={(event) => {
        if (event.name === "return") {
          mark("PRESSED:First");
          return true;
        }
        return false;
      }}
    />
    <text
      id="second"
      ref={(api: MountedElementApi) => {
        secondApi = api;
      }}
      value={second}
      onKey={(event) => {
        if (event.name === "return") {
          mark("PRESSED:Second");
          setTimeout(() => {
            app.dispose();
            mark("PASS");
            process.exit(0);
          }, 150);
          return true;
        }
        return false;
      }}
    />
  </vstack>,
  { terminal }
);

app.start();

setTimeout(() => {
  const result = mode === "ref" ? secondApi?.focus() : app.focus("second");
  const handled = Boolean(
    result &&
      typeof result === "object" &&
      "handled" in result &&
      result.handled
  );

  mark(`FOCUS:${mode}:${handled ? "handled" : "unhandled"}`);
  mark(`FOCUSED:${app.getFocusedId() ?? ""}`);
  mark(`API_FOCUSED:${secondApi?.isFocused() ? "true" : "false"}`);
  mark("READY");
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
