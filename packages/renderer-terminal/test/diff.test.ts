import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrame,
  diffFrames,
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
