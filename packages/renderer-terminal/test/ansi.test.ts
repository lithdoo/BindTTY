import assert from "node:assert/strict";
import test from "node:test";

import { encodeAnsiPatch } from "@bindtty/renderer-terminal";
import type { FramePatch } from "@bindtty/renderer-terminal";

test("encodeAnsiPatch returns an empty string for empty patches", () => {
  const patch: FramePatch = {
    width: 2,
    height: 1,
    changes: []
  };

  assert.equal(encodeAnsiPatch(patch), "");
});

test("encodeAnsiPatch uses one-based cursor coordinates", () => {
  const patch: FramePatch = {
    width: 4,
    height: 3,
    changes: [
      {
        x: 2,
        y: 1,
        cell: {
          char: "A",
          style: {}
        }
      }
    ]
  };

  assert.equal(encodeAnsiPatch(patch), "\x1b[2;3H\x1b[0mA\x1b[0m");
});

test("encodeAnsiPatch encodes text style and colors", () => {
  const patch: FramePatch = {
    width: 1,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "X",
          style: {
            foreground: "red",
            background: "brightBlue",
            bold: true,
            dim: true,
            italic: true,
            underline: true,
            inverse: true
          }
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0m\x1b[1;2;3;4;7;31;104mX\x1b[0m"
  );
});

test("encodeAnsiPatch resets style before each changed cell and at the end", () => {
  const patch: FramePatch = {
    width: 2,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "A",
          style: {
            foreground: "green"
          }
        }
      },
      {
        x: 1,
        y: 0,
        cell: {
          char: "B",
          style: {}
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0m\x1b[32mA\x1b[1;2H\x1b[0mB\x1b[0m"
  );
});

test("encodeAnsiPatch supports bright foreground and background colors", () => {
  const patch: FramePatch = {
    width: 1,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "!",
          style: {
            foreground: "brightWhite",
            background: "gray"
          }
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0m\x1b[97;100m!\x1b[0m"
  );
});

test("encodeAnsiPatch throws for unsupported colors", () => {
  const foregroundPatch: FramePatch = {
    width: 1,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "X",
          style: {
            foreground: "#ff0000"
          }
        }
      }
    ]
  };
  const backgroundPatch: FramePatch = {
    width: 1,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "X",
          style: {
            background: "orange"
          }
        }
      }
    ]
  };

  assert.throws(
    () => encodeAnsiPatch(foregroundPatch),
    /Unsupported foreground color: #ff0000/
  );
  assert.throws(
    () => encodeAnsiPatch(backgroundPatch),
    /Unsupported background color: orange/
  );
});

test("encodeAnsiPatch skips wide placeholder cells", () => {
  const patch: FramePatch = {
    width: 2,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "中",
          style: {},
          width: 2
        }
      },
      {
        x: 1,
        y: 0,
        cell: {
          char: "",
          style: {},
          width: 0
        }
      }
    ]
  };

  assert.equal(encodeAnsiPatch(patch), "\x1b[1;1H\x1b[0m中\x1b[0m");
});

test("encodeAnsiPatch emits blank cells that clear old wide text", () => {
  const patch: FramePatch = {
    width: 2,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: " ",
          style: {},
          width: 1
        }
      },
      {
        x: 1,
        y: 0,
        cell: {
          char: " ",
          style: {},
          width: 1
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0m \x1b[1;2H\x1b[0m \x1b[0m"
  );
});

test("encodeAnsiPatch sorts mixed wide changes and still skips placeholders", () => {
  const patch: FramePatch = {
    width: 3,
    height: 1,
    changes: [
      {
        x: 2,
        y: 0,
        cell: {
          char: "B",
          style: {},
          width: 1
        }
      },
      {
        x: 1,
        y: 0,
        cell: {
          char: "",
          style: {},
          width: 0
        }
      },
      {
        x: 0,
        y: 0,
        cell: {
          char: "中",
          style: {},
          width: 2
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0m中\x1b[1;3H\x1b[0mB\x1b[0m"
  );
});

test("encodeAnsiPatch ignores placeholder-only changes without moving the cursor", () => {
  const patch: FramePatch = {
    width: 2,
    height: 1,
    changes: [
      {
        x: 1,
        y: 0,
        cell: {
          char: "",
          style: {},
          width: 0
        }
      }
    ]
  };

  assert.equal(encodeAnsiPatch(patch), "");
});
