import { performance } from "node:perf_hooks";

import { createApp } from "../packages/bindtty/dist/index.js";
import { createYogaLayoutEngine } from "../packages/layout/dist/index.js";
import { createSignal } from "../packages/signal/dist/index.js";
import { elementTemplate } from "../packages/vnode/dist/index.js";

const iterations = 100;
const viewport = { columns: 80, rows: 24 };

function measureIntent(kind) {
  const source = createSignal(kind === "paint" ? "red" : kind === "layout" ? "0" : true);
  let layoutCalls = 0;
  let writes = 0;
  const delegate = createYogaLayoutEngine();
  const layoutEngine = {
    layout(root, options) {
      layoutCalls += 1;
      return delegate.layout(root, options);
    }
  };
  const template = kind === "structure"
    ? elementTemplate("box", {
      id: "target",
      focusable: source,
      onKey: () => false
    }, [elementTemplate("text", { value: "row" })])
    : elementTemplate("text", {
      value: kind === "layout" ? source : "row",
      color: kind === "paint" ? source : undefined
    });
  const app = createApp(template, {
    stdout: {
      ...viewport,
      write() {
        writes += 1;
      }
    },
    layoutEngine
  });
  app.start();

  const started = performance.now();
  for (let index = 1; index <= iterations; index += 1) {
    source.set(
      kind === "paint"
        ? (index % 2 === 0 ? "red" : "blue")
        : kind === "layout"
          ? String(index)
          : index % 2 === 0
    );
    app.render();
  }
  const durationMs = performance.now() - started;
  app.dispose();

  return {
    durationMs,
    operationsPerSecond: iterations / (durationMs / 1_000),
    layoutCalls,
    writes
  };
}

const result = {
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    iterations
  },
  paint: measureIntent("paint"),
  layout: measureIntent("layout"),
  structure: measureIntent("structure")
};

if (result.paint.layoutCalls !== 1) {
  throw new Error(`Paint fixture unexpectedly ran layout ${result.paint.layoutCalls} times`);
}
if (result.layout.layoutCalls !== iterations + 1) {
  throw new Error(`Layout fixture ran layout ${result.layout.layoutCalls} times`);
}
if (result.structure.layoutCalls !== iterations + 1) {
  throw new Error(`Structure fixture ran layout ${result.structure.layoutCalls} times`);
}

console.log(JSON.stringify(result, null, 2));
