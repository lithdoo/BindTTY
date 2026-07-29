import { computed, createSignal, effect } from "../packages/signal/dist/index.js";
import { mountTemplate } from "../packages/runtime/dist/index.js";
import {
  componentTemplate,
  elementTemplate
} from "../packages/vnode/dist/index.js";

const iterationsPerWave = 2_000;
const source = createSignal(0);
let effectRuns = 0;

function Fixture() {
  const label = computed(() => `value:${source.get()}`);
  effect(() => {
    source.get();
    effectRuns += 1;
  });
  return elementTemplate("text", { value: label });
}

function runWave() {
  for (let index = 0; index < iterationsPerWave; index += 1) {
    const mounted = mountTemplate(componentTemplate(Fixture, {}));
    mounted?.dispose();
  }
}

function collectHeap() {
  globalThis.gc?.();
  globalThis.gc?.();
  return process.memoryUsage().heapUsed;
}

const beforeBytes = collectHeap();
runWave();
const afterFirstWaveBytes = collectHeap();
runWave();
const afterSecondWaveBytes = collectHeap();

const effectRunsBeforeProbe = effectRuns;
source.set(1);
const retainedReactiveRuns = effectRuns - effectRunsBeforeProbe;
if (retainedReactiveRuns !== 0) {
  throw new Error(
    `Expected no retained reactive effects, observed ${retainedReactiveRuns}`
  );
}

console.log(JSON.stringify({
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    iterationsPerWave,
    gcExposed: typeof globalThis.gc === "function"
  },
  ownershipHeap: {
    beforeBytes,
    afterFirstWaveBytes,
    afterSecondWaveBytes,
    firstWaveDeltaBytes: afterFirstWaveBytes - beforeBytes,
    secondWaveDeltaBytes: afterSecondWaveBytes - afterFirstWaveBytes
  },
  retainedReactiveRuns
}, null, 2));
