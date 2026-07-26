"use strict";

function createWin32InputProvider() {
  if (process.platform !== "win32") {
    return null;
  }

  let binding;
  try {
    binding = require("./build/Release/bindtty_win32_input.node");
  } catch {
    return null;
  }

  if (
    typeof binding.isAvailable !== "function" ||
    typeof binding.attach !== "function" ||
    !binding.isAvailable()
  ) {
    return null;
  }

  return {
    isAvailable() {
      return binding.isAvailable();
    },
    attach(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Win32 input listener must be a function");
      }
      return binding.attach(listener);
    }
  };
}

module.exports = { createWin32InputProvider };
