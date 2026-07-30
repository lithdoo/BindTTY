import assert from "node:assert/strict";
import test from "node:test";

import { encodeAnsiPatch } from "@bindtty/renderer-terminal";
import type { FramePatch } from "@bindtty/renderer-terminal";

test("encodeAnsiPatch returns an empty string for empty patches", () => {
  const patch: FramePatch = {
    kind: "full",
    width: 2,
    height: 1,
    changes: []
  };

  assert.equal(encodeAnsiPatch(patch), "");
});

test("encodeAnsiPatch protects full patches from terminal autowrap", () => {
  const patch: FramePatch = {
    kind: "full",
    width: 1,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "A",
          style: {}
        }
      }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[?7l\x1b[1;1H\x1b[0mA\x1b[0m\x1b[?7h"
  );
});

test("encodeAnsiPatch uses one-based cursor coordinates", () => {
  const patch: FramePatch = {
    kind: "incremental",
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
    kind: "incremental",
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

test("encodeAnsiPatch keeps adjacent cells in one cursor run", () => {
  const patch: FramePatch = {
    kind: "incremental",
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
    "\x1b[1;1H\x1b[0m\x1b[32mA\x1b[0mB\x1b[0m"
  );
});

test("encodeAnsiPatch supports bright foreground and background colors", () => {
  const patch: FramePatch = {
    kind: "incremental",
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
    kind: "incremental",
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
    kind: "incremental",
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
    kind: "incremental",
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
    kind: "incremental",
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
    "\x1b[1;1H\x1b[0m  \x1b[0m"
  );
});

test("encodeAnsiPatch sorts mixed wide changes and still skips placeholders", () => {
  const patch: FramePatch = {
    kind: "incremental",
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

test("encodeAnsiPatch re-anchors every visible cell after wide text", () => {
  const patch: FramePatch = {
    kind: "full",
    width: 5,
    height: 1,
    ordered: true,
    changes: [
      { x: 0, y: 0, cell: { char: "中", style: {}, width: 2 } },
      { x: 1, y: 0, cell: { char: "", style: {}, width: 0 } },
      { x: 2, y: 0, cell: { char: "🙂", style: {}, width: 2 } },
      { x: 3, y: 0, cell: { char: "", style: {}, width: 0 } },
      { x: 4, y: 0, cell: { char: "A", style: {}, width: 1 } }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[?7l\x1b[1;1H\x1b[0m中\x1b[1;3H\x1b[0m🙂" +
      "\x1b[1;5H\x1b[0mA\x1b[0m\x1b[?7h"
  );
});

test("encodeAnsiPatch uses one cursor run per contiguous row", () => {
  const patch: FramePatch = {
    kind: "incremental",
    width: 3,
    height: 2,
    changes: [
      { x: 1, y: 1, cell: { char: "D", style: {} } },
      { x: 0, y: 0, cell: { char: "A", style: {} } },
      { x: 0, y: 1, cell: { char: "C", style: {} } },
      { x: 1, y: 0, cell: { char: "B", style: {} } }
    ]
  };

  assert.equal(
    encodeAnsiPatch(patch),
    "\x1b[1;1H\x1b[0mAB\x1b[2;1H\x1b[0mCD\x1b[0m"
  );
});

test("encodeAnsiPatch compacts a full terminal frame", () => {
  const width = 80;
  const height = 24;
  const changes: FramePatch["changes"] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      changes.push({
        x,
        y,
        cell: { char: " ", style: {}, width: 1 }
      });
    }
  }

  const encoded = encodeAnsiPatch({
    kind: "full",
    width,
    height,
    changes
  });
  const perCellBaseline = changes.reduce(
    (length, change) =>
      length +
      `\x1b[${change.y + 1};${change.x + 1}H`.length +
      "\x1b[0m ".length,
    "\x1b[?7l\x1b[0m\x1b[?7h".length
  );

  assert.ok(
    encoded.length * 5 < perCellBaseline,
    `expected run encoding to use under 20% of per-cell output: ${encoded.length}/${perCellBaseline}`
  );
});

test("encodeAnsiPatch ignores placeholder-only changes without moving the cursor", () => {
  const patch: FramePatch = {
    kind: "incremental",
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
