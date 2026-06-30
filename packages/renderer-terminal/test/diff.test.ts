import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrame,
  diffFrames,
  setCell
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
      }
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
          style: {}
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
        }
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
          style: {}
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
      }
    }
  });
});
