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

let lastFrame = "";

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

const app = createApp(
  <vstack gap={1}>
    <box width={boxWidth} padding={1} border>
      <text
        value="中中中🙂🙂ABC"
        wrap="hard"
        ref={(api: MountedElementApi) => {
          api.onLayout = (layout: unknown) => {
            const node = layout as LayoutNode;
            const frame =
              `FRAME:${terminal.viewport.width}:` +
              `${node.rect.width}x${node.rect.height}`;
            if (frame === lastFrame) {
              return;
            }

            lastFrame = frame;
            mark(frame);
          };
        }}
      />
    </box>
  </vstack>,
  { terminal }
);

app.start();

terminal.onResize(() => {
  boxWidth.set(terminal.viewport.width);
  mark(`VIEWPORT:${terminal.viewport.width}`);
});

terminal.onKey((event) => {
  if (event.kind !== "text" || event.text !== "q") {
    return;
  }

  app.dispose();
  mark("PASS");
  process.exit(0);
});

setTimeout(() => {
  mark("READY");
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 20_000);
