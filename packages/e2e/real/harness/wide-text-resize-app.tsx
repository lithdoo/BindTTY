import fs from "node:fs";

import { createApp } from "bindtty";
import { createSignal } from "@bindtty/signal";
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

let ready = false;
let initialHeight: number | null = null;
let rewrapSeen = false;

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true,
  exitOnCtrlC: false,
  platformAdapter: ptyPlatformAdapter
});

const boxWidth = createSignal(terminal.viewport.width);

function syncViewport(): void {
  const width = terminal.viewport.width;
  boxWidth.set(width);
  mark(`VIEWPORT:${width}`);
  app.resize();
}

const app = createApp(
  <vstack gap={1}>
    <box width={boxWidth} padding={1} border>
      <text
        value="中中中🙂🙂ABC"
        wrap="hard"
        ref={(api: MountedElementApi) => {
          api.onLayout = (layout: unknown) => {
            const node = layout as LayoutNode;
            const height = node.rect.height;

            if (initialHeight === null) {
              initialHeight = height;
              mark(`HEIGHT:${height}`);
              mark(`LAYOUT:${node.rect.width}x${height}`);
              return;
            }

            if (!ready || rewrapSeen || height === initialHeight) {
              return;
            }

            rewrapSeen = true;
            mark(`HEIGHT:${height}`);
            mark(`LAYOUT:${node.rect.width}x${height}`);
            mark("REWARP");
            clearInterval(pollViewport);
            setTimeout(() => {
              app.dispose();
              mark("PASS");
              process.exit(0);
            }, 150);
          };
        }}
      />
    </box>
  </vstack>,
  { terminal }
);

app.start();

terminal.onResize(() => {
  syncViewport();
});

let lastViewportWidth = terminal.viewport.width;

const pollViewport = setInterval(() => {
  const width = terminal.viewport.width;

  if (width === lastViewportWidth) {
    return;
  }

  lastViewportWidth = width;
  syncViewport();
}, 50);

setTimeout(() => {
  mark("READY");
  ready = true;
}, 300);

setTimeout(() => {
  clearInterval(pollViewport);
  fail("TIMEOUT");
}, 12_000);
