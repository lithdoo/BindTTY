import assert from "node:assert/strict";
import test from "node:test";

import {
  bindingCandidatePaths,
  createWin32InputProvider,
  DEFAULT_QUEUE_CAPACITY
} from "../index.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeQueueCapacity } = require("../loader.cjs");

test("optional provider is inert on non-Windows platforms", { skip: process.platform === "win32" }, () => {
  assert.equal(createWin32InputProvider(), null);
});

test("loader prefers architecture-specific Node-API prebuild before node-gyp output", () => {
  const candidates = bindingCandidatePaths("win32", "arm64");
  assert.match(candidates[0], /prebuilds[\\/]win32-arm64[\\/]node\.napi\.node$/);
  assert.match(candidates[1], /build[\\/]Release[\\/]bindtty_win32_input\.node$/);
  assert.deepEqual(bindingCandidatePaths("linux", "x64"), []);
});

test("native input queue capacity has bounded deterministic defaults", () => {
  assert.equal(DEFAULT_QUEUE_CAPACITY, 1024);
  assert.equal(normalizeQueueCapacity(undefined), 1024);
  assert.equal(normalizeQueueCapacity(16), 16);
  assert.equal(normalizeQueueCapacity(65_536), 65_536);
  assert.throws(() => normalizeQueueCapacity(15), /between 16 and 65536/);
  assert.throws(() => normalizeQueueCapacity(65_537), /between 16 and 65536/);
  assert.throws(() => normalizeQueueCapacity(16.5), /between 16 and 65536/);
});
