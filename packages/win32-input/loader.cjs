"use strict";

const path = require("node:path");

const DEFAULT_QUEUE_CAPACITY = 1024;
const MIN_QUEUE_CAPACITY = 16;
const MAX_QUEUE_CAPACITY = 65536;

function bindingCandidates(platform = process.platform, arch = process.arch) {
  if (platform !== "win32") {
    return [];
  }
  return [
    path.join(__dirname, "prebuilds", `win32-${arch}`, "node.napi.node"),
    path.join(__dirname, "build", "Release", "bindtty_win32_input.node")
  ];
}

function loadBinding(requireBinding = require) {
  for (const candidate of bindingCandidates()) {
    try {
      return requireBinding(candidate);
    } catch {
      // Try the source-build fallback after the prebuild.
    }
  }
  return null;
}

function normalizeQueueCapacity(value) {
  const capacity = value ?? DEFAULT_QUEUE_CAPACITY;
  if (
    !Number.isInteger(capacity) ||
    capacity < MIN_QUEUE_CAPACITY ||
    capacity > MAX_QUEUE_CAPACITY
  ) {
    throw new RangeError("queueCapacity must be an integer between 16 and 65536");
  }
  return capacity;
}

module.exports = {
  DEFAULT_QUEUE_CAPACITY,
  MAX_QUEUE_CAPACITY,
  MIN_QUEUE_CAPACITY,
  bindingCandidates,
  loadBinding,
  normalizeQueueCapacity
};
