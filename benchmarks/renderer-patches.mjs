import { performance } from "node:perf_hooks";
import {
  createFrame,
  diffFrames,
  encodeAnsiPatch,
  setCell
} from "../packages/renderer-terminal/dist/index.js";

const warmup = 200;
const samples = 1_000;
const viewport = { width: 80, height: 24 };

function fixture(changedEvery = 1) {
  const frame = createFrame(viewport.width, viewport.height);
  for (let y = 0; y < viewport.height; y += 1) {
    for (let x = 0; x < viewport.width; x += changedEvery) {
      setCell(frame, x, y, {
        char: String.fromCharCode(65 + ((x + y) % 26)),
        style: y % 2 === 0 ? { foreground: "cyan" } : {}
      });
    }
  }
  return frame;
}

function measure(patch, ordered) {
  const candidate = { ...patch, ordered };
  for (let index = 0; index < warmup; index += 1) {
    encodeAnsiPatch(candidate);
  }
  const durations = [];
  let bytes = 0;
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    const ansi = encodeAnsiPatch(candidate);
    durations.push(performance.now() - started);
    bytes = Buffer.byteLength(ansi);
  }
  durations.sort((left, right) => left - right);
  return {
    medianDurationMs: durations[Math.floor(durations.length / 2)],
    bytes
  };
}

const full = diffFrames(null, fixture());
const previous = fixture();
const next = fixture();
for (let index = 0; index < 10; index += 1) {
  setCell(next, index * 7, index, {
    char: "Z",
    style: { foreground: "yellow", bold: true }
  });
}
const incremental = diffFrames(previous, next);
const result = {
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    warmup,
    samples,
    viewport
  },
  full: {
    ordered: measure(full, true),
    defensiveSort: measure(full, false),
    changes: full.changes.length
  },
  incremental: {
    ordered: measure(incremental, true),
    defensiveSort: measure(incremental, false),
    changes: incremental.changes.length
  }
};

if (result.full.ordered.bytes !== result.full.defensiveSort.bytes) {
  throw new Error("Full patch byte output changed between encoder paths.");
}
if (result.incremental.ordered.bytes !== result.incremental.defensiveSort.bytes) {
  throw new Error("Incremental patch byte output changed between encoder paths.");
}

console.log(JSON.stringify(result, null, 2));
