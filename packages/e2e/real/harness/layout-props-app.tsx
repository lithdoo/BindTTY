import fs from "node:fs";

import { createApp } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";
import type { LayoutNode } from "@bindtty/layout";
import type { MountedElementApi } from "@bindtty/vnode";

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

const checks = {
  margin: false,
  padding: false,
  minWidth: false
};

function tryPass(): void {
  if (!checks.margin || !checks.padding || !checks.minWidth) {
    return;
  }

  setTimeout(() => {
    app.dispose();
    mark("PASS");
    process.exit(0);
  }, 150);
}

function readRect(layout: unknown): LayoutNode["rect"] {
  return (layout as LayoutNode).rect;
}

function trackLayout(
  name: "margin" | "padding" | "minWidth",
  expected: number,
  axis: "x" | "y",
  api: MountedElementApi
): void {
  api.onLayout = (layout: unknown) => {
    const value = readRect(layout)[axis];

    mark(`${name.toUpperCase()}_${axis.toUpperCase()}:${value}`);

    if (value === expected) {
      checks[name] = true;
      tryPass();
    }
  };
}

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
    <vstack>
      <text value="A" marginBottom={2} />
      <text
        value="B"
        ref={(api: MountedElementApi) => {
          trackLayout("margin", 3, "y", api);
        }}
      />
    </vstack>
    <box paddingLeft={3}>
      <text
        value="P"
        ref={(api: MountedElementApi) => {
          trackLayout("padding", 3, "x", api);
        }}
      />
    </box>
    <hstack>
      <spacer size={1} minWidth={5} />
      <text
        value="S"
        ref={(api: MountedElementApi) => {
          trackLayout("minWidth", 5, "x", api);
        }}
      />
    </hstack>
  </vstack>,
  { terminal }
);

app.start();
mark("READY");

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
