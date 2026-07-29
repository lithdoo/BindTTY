"use strict";

const {
  DEFAULT_QUEUE_CAPACITY,
  bindingCandidates,
  loadBinding,
  normalizeQueueCapacity
} = require("./loader.cjs");

function createWin32InputProvider(options = {}) {
  if (process.platform !== "win32") {
    return null;
  }
  const queueCapacity = normalizeQueueCapacity(options.queueCapacity);
  const binding = loadBinding(require);
  if (
    !binding ||
    typeof binding.isAvailable !== "function" ||
    typeof binding.attach !== "function" ||
    !binding.isAvailable()
  ) {
    return null;
  }
  return {
    isAvailable: () => binding.isAvailable(),
    attach(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Win32 input listener must be a function");
      }
      return binding.attach(listener, queueCapacity);
    },
    getStats() {
      const stats = binding.getStats?.();
      return {
        queueCapacity,
        droppedRecords: stats?.droppedRecords ?? 0n
      };
    }
  };
}

module.exports = {
  DEFAULT_QUEUE_CAPACITY,
  bindingCandidatePaths: bindingCandidates,
  createWin32InputProvider
};
