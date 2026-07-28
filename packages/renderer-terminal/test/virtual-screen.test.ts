import assert from "node:assert/strict";
import test from "node:test";

import { VirtualScreen } from "./virtual-screen.js";

test("VirtualScreen applies cursor positioning and display erase", () => {
  const screen = new VirtualScreen(4, 2);

  screen.seed(["OLD!", "data"]);
  screen.write("\x1b[2J\x1b[1;2HAB");

  assert.deepEqual(screen.lines(), [" AB ", "    "]);
});

test("VirtualScreen models immediate Win32 bottom-right scrolling", () => {
  const screen = new VirtualScreen(3, 2, { wrapAtEol: "immediate" });

  screen.write("\x1b[1;1Htop\x1b[2;1Hbot");

  assert.deepEqual(screen.lines(), ["bot", "   "]);
});

test("VirtualScreen models autowrap protection around the bottom-right cell", () => {
  const screen = new VirtualScreen(3, 2, { wrapAtEol: "immediate" });

  screen.write("\x1b[?7l\x1b[1;1Htop\x1b[2;1Hbot\x1b[?7h");

  assert.deepEqual(screen.lines(), ["top", "bot"]);
});
