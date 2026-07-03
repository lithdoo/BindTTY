import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canLoadNodePty,
  createMarkerFile,
  detectHostKind,
  formatRuntimeEnv,
  readRuntimeEnv
} from "../src/env.js";
import { MarkerLog } from "../src/marker-log.js";
import { PtySession, resolveNodeBinary } from "../src/pty-session.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);
const harnessDir = path.join(packageRoot, "dist", "real", "harness");

function harnessPath(name: string): string {
  return path.join(harnessDir, `${name}.js`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function skipUnlessPty(t: test.TestContext): boolean {
  const env = readRuntimeEnv();

  t.diagnostic(formatRuntimeEnv(env));

  if (!canLoadNodePty()) {
    t.skip("node-pty is not installed or failed to load native bindings");
    return true;
  }

  return false;
}

test("runtime environment report", () => {
  const env = readRuntimeEnv();
  assert.ok(["windows", "wsl", "linux", "macos", "unknown"].includes(env.hostKind));
  assert.ok(env.nodeVersion.startsWith("v"));
});

test("real PTY: counter app renders and increments through Button", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("counter");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("counter-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(400);

    session.write("\r");

    await marker.waitFor("COUNT:1", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.ok(result.markers.includes("COUNT:1"));
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: TextInput typing and submit in terminal", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("interaction");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("interaction-app")],
    cwd: packageRoot,
    markerFile,
    cols: 100,
    rows: 30
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(200);
    session.write("a");
    await delay(50);
    session.write("b");
    await delay(50);
    session.write("\r");

    await marker.waitFor("SUBMITTED:sent:ab", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.match(result.visibleOutput, /sent:ab/);
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: Tab moves focus between Button widgets", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("focus");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("focus-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(300);

    session.write("\t");
    await delay(100);
    session.write("\r");

    await marker.waitFor("PRESSED:Second", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(!result.markers.includes("PRESSED:First"));
    assert.ok(result.markers.includes("PRESSED:Second"));
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: TextInput backspace edits before submit", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("textedit");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("textedit-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(200);
    session.write("a");
    await delay(50);
    session.write("b");
    await delay(50);
    session.write("\x7f");
    await delay(50);
    session.write("\r");

    await marker.waitFor("SUBMITTED:sent:a", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.match(result.visibleOutput, /sent:a/);
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: ScrollView scrolls with down arrow", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("scroll");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("scroll-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(300);

    session.write("\x1b[B");
    await delay(100);
    session.write("\x1b[B");

    await marker.waitFor("OFFSET:2", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.ok(result.markers.includes("OFFSET:2"));
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: ScrollView clamps rendering without writing controlled offset", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("scroll-clamp");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("scroll-clamp-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await marker.waitFor("OFFSET:99", { timeoutMs: 8_000 });
    assert.ok(!marker.readLines().includes("OFFSET:2"));

    session.write("\x1b[B");

    await marker.waitFor("OFFSET:2", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.ok(result.markers.includes("OFFSET:99"));
    assert.ok(result.markers.includes("OFFSET:2"));
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("real PTY: List scrolls with down arrow", { concurrency: false }, async (t) => {
  if (skipUnlessPty(t)) {
    return;
  }

  const markerFile = createMarkerFile("list");
  const marker = MarkerLog.create(markerFile);
  const session = new PtySession({
    command: resolveNodeBinary(),
    args: [harnessPath("list-app")],
    cwd: packageRoot,
    markerFile,
    cols: 80,
    rows: 24
  });

  try {
    await marker.waitFor("READY", { timeoutMs: 8_000 });
    await delay(300);

    session.write("\x1b[B");

    await marker.waitFor("OFFSET:1", { timeoutMs: 8_000 });
    await marker.waitFor("PASS", { timeoutMs: 8_000 });
    const result = await session.finish(marker, 12_000);

    assert.equal(result.exitCode, 0);
    assert.ok(result.markers.includes("PASS"));
    assert.ok(result.markers.includes("OFFSET:1"));
  } finally {
    session.dispose();
    marker.cleanup();
  }
});

test("host kind is recorded for the current runner", () => {
  const kind = detectHostKind();
  assert.ok(kind.length > 0);
});
