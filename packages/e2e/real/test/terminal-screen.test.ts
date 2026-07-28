import assert from "node:assert/strict";
import test from "node:test";

import { TerminalScreen } from "../src/terminal-screen.js";

test("TerminalScreen exposes Win32-style bottom-right scrolling", () => {
  const screen = new TerminalScreen(3, 2);

  screen.write("\x1b[1;1Htop\x1b[2;1Hbot");

  assert.deepEqual(screen.lines(), ["bot", "   "]);
});

test("TerminalScreen keeps final coordinates while autowrap is disabled", () => {
  const screen = new TerminalScreen(3, 2);

  screen.write("\x1b[?7l\x1b[1;1Htop\x1b[2;1Hbot\x1b[?7h");

  assert.deepEqual(screen.lines(), ["top", "bot"]);
});

test("TerminalScreen replays frames inside synchronized-output boundaries", () => {
  const screen = new TerminalScreen(3, 2);

  screen.write(
    "\x1b[?2026h\x1b[?7l\x1b[1;1Htop\x1b[2;1Hbot\x1b[?7h\x1b[?2026l"
  );

  assert.deepEqual(screen.lines(), ["top", "bot"]);
});

test("TerminalScreen replays split ANSI and wide graphemes after resize", () => {
  const screen = new TerminalScreen(4, 2);

  screen.write("\x1b[?7");
  screen.write("l\x1b[1;1H中A");
  screen.resize(5, 2);
  screen.write("\x1b[1;4HB\x1b[2;1H🙂C\x1b[?7h");

  assert.deepEqual(screen.lines(), ["中AB ", "🙂C  "]);
});
