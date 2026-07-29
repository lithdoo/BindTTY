import { performance } from "node:perf_hooks";

import { createApp } from "../packages/bindtty/dist/index.js";
import { createInputParser } from "../packages/input/dist/index.js";
import { createSignal, effect } from "../packages/signal/dist/index.js";
import { layoutText } from "../packages/text/dist/index.js";
import { elementTemplate } from "../packages/vnode/dist/index.js";

const environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  iterations: {
    signalSets: 100_000,
    fullFrames: 10,
    frameRows: 200,
    pasteCodeUnits: 100_000,
    cacheEntries: 5_000
  }
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureSignal() {
  const source = createSignal(0);
  let observed = 0;
  const dispose = effect(() => {
    observed = source.get();
  });
  const started = performance.now();
  for (let index = 1; index <= environment.iterations.signalSets; index += 1) {
    source.set(index);
  }
  const durationMs = performance.now() - started;
  dispose();
  if (observed !== environment.iterations.signalSets) {
    throw new Error("Signal benchmark did not observe the final value.");
  }
  return {
    durationMs,
    operationsPerSecond:
      environment.iterations.signalSets / (durationMs / 1_000)
  };
}

function createFrameFixture() {
  return elementTemplate(
    "vstack",
    {},
    Array.from({ length: environment.iterations.frameRows }, (_, index) =>
      elementTemplate("text", {
        value: `row-${String(index).padStart(3, "0")} 中🙂`
      })
    )
  );
}

function measureFullFrame() {
  const samples = [];
  let bytes = 0;
  for (let index = 0; index < environment.iterations.fullFrames; index += 1) {
    const output = [];
    const app = createApp(createFrameFixture(), {
      stdout: {
        columns: 80,
        rows: 240,
        write(chunk) {
          output.push(chunk);
        }
      }
    });
    const started = performance.now();
    const patch = app.render();
    samples.push(performance.now() - started);
    bytes = Buffer.byteLength(patch);
    app.dispose();
  }
  return {
    medianDurationMs: median(samples),
    minDurationMs: Math.min(...samples),
    maxDurationMs: Math.max(...samples),
    patchBytes: bytes
  };
}

function measurePaste() {
  const parser = createInputParser({ pasteMode: "event" });
  const content = "a".repeat(environment.iterations.pasteCodeUnits);
  const started = performance.now();
  const events = parser.parse(`\x1b[200~${content}\x1b[201~`);
  const durationMs = performance.now() - started;
  if (events.length !== 1 || events[0]?.name !== "paste") {
    throw new Error("Paste benchmark must produce exactly one paste event.");
  }
  return {
    durationMs,
    codeUnitsPerSecond:
      environment.iterations.pasteCodeUnits / (durationMs / 1_000),
    eventCount: events.length
  };
}

function measureCacheHeap() {
  global.gc?.();
  const beforeBytes = process.memoryUsage().heapUsed;
  for (let index = 0; index < environment.iterations.cacheEntries; index += 1) {
    layoutText(`cache-${index}-${"x".repeat(32)}`, {
      width: 16,
      wrap: "hard"
    });
  }
  global.gc?.();
  const afterBytes = process.memoryUsage().heapUsed;
  return {
    beforeBytes,
    afterBytes,
    retainedDeltaBytes: afterBytes - beforeBytes,
    gcExposed: typeof global.gc === "function"
  };
}

// Warm up the main code paths before collecting the fixed samples.
createSignal(0).set(1);
layoutText("warmup", { width: 4, wrap: "hard" });
createInputParser({ pasteMode: "event" }).parse("\x1b[200~x\x1b[201~");

const result = {
  recordedAt: new Date().toISOString(),
  environment,
  signal: measureSignal(),
  fullFrame: measureFullFrame(),
  longPaste: measurePaste(),
  cacheHeap: measureCacheHeap()
};

console.log(JSON.stringify(result, null, 2));
