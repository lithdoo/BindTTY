import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDiagnosticLogger } from "@bindtty/terminal";

test("diagnostic logger writes correlated JSONL and serialized errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "bindtty-diagnostic-"));
  const path = join(directory, "nested", "trace.jsonl");
  try {
    const logger = createDiagnosticLogger("test-component", {
      path,
      runId: "test-run",
      flushIntervalMs: 60_000
    });
    logger.log("frame", { revision: 7, patchLength: 12 });
    logger.error(
      "write-error",
      Object.assign(new Error("broken pipe"), {
        code: "EPIPE",
        syscall: "write"
      })
    );
    logger.dispose();

    const records = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(records.length, 2);
    assert.equal(records[0]?.component, "test-component");
    assert.equal(records[0]?.runId, "test-run");
    assert.equal(records[0]?.event, "frame");
    assert.equal(records[0]?.revision, 7);
    assert.equal(records[1]?.event, "write-error");
    assert.deepEqual(records[1]?.error, {
      name: "Error",
      message: "broken pipe",
      stack: (records[1]?.error as { stack: string }).stack,
      code: "EPIPE",
      syscall: "write"
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("diagnostic logger stays disabled for an explicit false path", () => {
  const logger = createDiagnosticLogger("disabled", { path: false });
  assert.equal(logger.enabled, false);
  logger.log("ignored");
  logger.dispose();
});
