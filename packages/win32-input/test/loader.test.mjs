import assert from "node:assert/strict";
import test from "node:test";

import { createWin32InputProvider } from "../index.js";

test("optional provider is inert on non-Windows platforms", { skip: process.platform === "win32" }, () => {
  assert.equal(createWin32InputProvider(), null);
});
