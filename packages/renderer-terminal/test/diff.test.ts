import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrame,
  diffFrames,
  encodeAnsiPatch,
  setCell,
  writeText
} from "@bindtty/renderer-terminal";

test("diffFrames creates a full patch when previous frame is null", () => {
  const next = createFrame(2, 2);
  setCell(next, 1, 0, {
    char: "A",
    style: {
      foreground: "red"
    }
  });

  const patch = diffFrames(null, next);

  assert.equal(patch.width, 2);
  assert.equal(patch.height, 2);
  assert.equal(patch.changes.length, 4);
  assert.deepEqual(patch.changes[1], {
    x: 1,
    y: 0,
    cell: {
      char: "A",
      style: {
        foreground: "red"
      },
      width: 1
    }
  });
});

test("diffFrames returns no changes for equal frames", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  setCell(previous, 0, 0, { char: "A", style: { bold: true } });
  setCell(next, 0, 0, { char: "A", style: { bold: true } });

  assert.deepEqual(diffFrames(previous, next), {
    width: 2,
    height: 1,
    changes: []
  });
});

test("diffFrames reports changed cells", () => {
  const previous = createFrame(3, 1);
  const next = createFrame(3, 1);

  setCell(previous, 1, 0, { char: "A", style: {} });
  setCell(next, 1, 0, { char: "B", style: {} });

  assert.deepEqual(diffFrames(previous, next), {
    width: 3,
    height: 1,
    changes: [
      {
        x: 1,
        y: 0,
        cell: {
          char: "B",
          style: {},
          width: 1
        }
      }
    ]
  });
});

test("diffFrames reports style-only changes", () => {
  const previous = createFrame(1, 1);
  const next = createFrame(1, 1);

  setCell(previous, 0, 0, { char: "A", style: { foreground: "red" } });
  setCell(next, 0, 0, { char: "A", style: { foreground: "green" } });

  assert.deepEqual(diffFrames(previous, next).changes, [
    {
      x: 0,
      y: 0,
      cell: {
        char: "A",
        style: {
          foreground: "green"
        },
        width: 1
      }
    }
  ]);
});

test("diffFrames treats false boolean style as absent style", () => {
  const previous = createFrame(1, 1);
  const next = createFrame(1, 1);

  setCell(previous, 0, 0, { char: "A", style: { bold: false } });
  setCell(next, 0, 0, { char: "A", style: {} });

  assert.deepEqual(diffFrames(previous, next).changes, []);
});

test("diffFrames creates a full patch when frame size changes", () => {
  const previous = createFrame(1, 1);
  const next = createFrame(2, 1);

  setCell(next, 1, 0, { char: "B", style: {} });

  assert.deepEqual(diffFrames(previous, next), {
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
          char: "B",
          style: {},
          width: 1
        }
      }
    ]
  });
});

test("diffFrames clones changed cells", () => {
  const next = createFrame(1, 1);
  setCell(next, 0, 0, { char: "A", style: { foreground: "red" } });

  const patch = diffFrames(null, next);

  setCell(next, 0, 0, { char: "B", style: { foreground: "blue" } });

  assert.deepEqual(patch.changes[0], {
    x: 0,
    y: 0,
    cell: {
      char: "A",
      style: {
        foreground: "red"
      },
      width: 1
    }
  });
});

test("diffFrames expands dirty ranges around wide cells", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  setCell(next, 0, 0, { char: "A", style: {} });
  setCell(next, 1, 0, { char: "B", style: {} });

  assert.deepEqual(diffFrames(previous, next), {
    width: 2,
    height: 1,
    changes: [
      {
        x: 0,
        y: 0,
        cell: {
          char: "A",
          style: {},
          width: 1
        }
      },
      {
        x: 1,
        y: 0,
        cell: {
          char: "B",
          style: {},
          width: 1
        }
      }
    ]
  });
});

test("diffFrames includes placeholder cells for new wide characters", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  setCell(previous, 0, 0, { char: "A", style: {} });
  setCell(previous, 1, 0, { char: "B", style: {} });
  writeText(next, 0, 0, "中");

  assert.deepEqual(diffFrames(previous, next).changes, [
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
  ]);
});

test("diffFrames ignores placeholder-only style changes", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  writeText(next, 0, 0, "中");
  next.cells[1] = {
    char: "",
    style: {
      inverse: true
    },
    width: 0
  };

  assert.deepEqual(diffFrames(previous, next), {
    width: 2,
    height: 1,
    changes: []
  });
});

test("diffFrames clears wide text when cells become blank", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  setCell(next, 0, 0, { char: " ", style: {}, width: 1 });
  setCell(next, 1, 0, { char: " ", style: {}, width: 1 });

  assert.deepEqual(diffFrames(previous, next), {
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
  });
});

test("diffFrames replaces one wide character with another", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  writeText(next, 0, 0, "文");

  assert.deepEqual(diffFrames(previous, next).changes, [
    {
      x: 0,
      y: 0,
      cell: {
        char: "文",
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
  ]);
});

test("diffFrames sorts dirty cells by y then x", () => {
  const previous = createFrame(3, 2);
  const next = createFrame(3, 2);

  setCell(previous, 0, 0, { char: "A", style: {} });
  setCell(previous, 1, 0, { char: "B", style: {} });
  setCell(previous, 0, 1, { char: "C", style: {} });
  setCell(next, 0, 0, { char: "X", style: {} });
  setCell(next, 1, 0, { char: "Y", style: {} });
  setCell(next, 0, 1, { char: "Z", style: {} });

  assert.deepEqual(
    diffFrames(previous, next).changes.map(({ x, y }) => `${y}:${x}`),
    ["0:0", "0:1", "1:0"]
  );
});

test("encodeAnsiPatch clears wide text from diffFrames CJK to blank patch", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  setCell(next, 0, 0, { char: " ", style: {}, width: 1 });
  setCell(next, 1, 0, { char: " ", style: {}, width: 1 });

  assert.equal(
    encodeAnsiPatch(diffFrames(previous, next)),
    "\x1b[1;1H\x1b[0m \x1b[1;2H\x1b[0m \x1b[0m"
  );
});

test("diffFrames returns no changes for equal wide frames", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  writeText(next, 0, 0, "中");

  assert.deepEqual(diffFrames(previous, next), {
    width: 2,
    height: 1,
    changes: []
  });
});

test("diffFrames expands dirty range when only a wide placeholder is overwritten", () => {
  const previous = createFrame(2, 1);
  const next = createFrame(2, 1);

  writeText(previous, 0, 0, "中");
  writeText(next, 0, 0, "中");
  setCell(next, 1, 0, { char: "X", style: {}, width: 1 });

  assert.deepEqual(diffFrames(previous, next).changes, [
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
        char: "X",
        style: {},
        width: 1
      }
    }
  ]);
});

test("encodeAnsiPatch writes only leading cells from full wide frame patches", () => {
  const frame = createFrame(2, 1);

  writeText(frame, 0, 0, "中");

  assert.equal(
    encodeAnsiPatch(diffFrames(null, frame)),
    "\x1b[1;1H\x1b[0m中\x1b[0m"
  );
});
