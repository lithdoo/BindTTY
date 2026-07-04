import fs from "node:fs";

import { createApp } from "bindtty";
import { Button, List } from "@bindtty/widgets";
import { createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

import { ptyPlatformAdapter } from "./pty-platform.js";

interface EventLine {
  id: number;
  message: string;
}

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
const showSidebar = createSignal(true);
const events = createSignal<readonly EventLine[]>([
  { id: 1, message: "event-1 boot" },
  { id: 2, message: "event-2 cpu=1.0%" },
  { id: 3, message: "event-3 heap=12 MB" },
  { id: 4, message: "event-4 rss=48 MB" },
  { id: 5, message: "event-5 system=28 GB" }
]);

let sawBottom = false;
let sawHidden = false;

function maybePass(): void {
  if (!sawBottom || !sawHidden) {
    return;
  }

  setTimeout(() => {
    app.dispose();
    mark("PASS");
    process.exit(0);
  }, 150);
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
  <screen gap={1} alignItems="stretch">
    <box padding={1} border>
      <hstack justifyContent="space-between" alignItems="center">
        <text value="Yoga Dashboard" bold />
        <text value="cpu=1.0% heap=12 MB rss=48 MB" />
      </hstack>
    </box>
    <hstack gap={1} flexGrow={1} alignItems="stretch">
      <box flexGrow={1} flexShrink={1} padding={1} border>
        <vstack gap={1}>
          <List
            height={2}
            items={events}
            offset={offset}
            getKey={(line) => (line as EventLine).id}
            render={(line) => <text value={(line as EventLine).message} />}
            onOffsetChange={(nextOffset) => {
              offset.set(nextOffset);
            }}
          />
          <hstack gap={1} flexWrap="wrap">
            <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
              <text value="CPU" bold />
              <text value="1.0%" />
            </box>
            <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
              <text value="Heap" bold />
              <text value="12 MB" />
            </box>
            <box width={12} flexGrow={1} flexShrink={1} padding={1} border>
              <text value="RSS" bold />
              <text value="48 MB" />
            </box>
          </hstack>
          <text
            value="This dashboard text rewraps when the PTY size changes."
            wrap="wrap"
          />
        </vstack>
      </box>
      <show when={showSidebar}>
        <box width={14} flexShrink={0} padding={1} border>
          <vstack gap={1}>
            <text value="Sidebar" bold />
            <Button
              label="Hide sidebar"
              onPress={() => {
                showSidebar.set(false);
              }}
            />
          </vstack>
        </box>
      </show>
    </hstack>
  </screen>,
  { terminal }
);

app.start();

offset.subscribe((value) => {
  mark(`OFFSET:${value}`);

  if (value === 3) {
    sawBottom = true;
    maybePass();
  }
});

showSidebar.subscribe((value) => {
  mark(`SIDEBAR:${value ? "visible" : "hidden"}`);

  if (!value) {
    sawHidden = true;
    maybePass();
  }
});

setTimeout(() => {
  mark("READY");
  mark(`OFFSET:${offset.get()}`);
  mark(`SIDEBAR:${showSidebar.get() ? "visible" : "hidden"}`);
}, 300);

setTimeout(() => {
  fail("TIMEOUT");
}, 12_000);
