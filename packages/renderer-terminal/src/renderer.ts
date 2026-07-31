import type { LayoutNode } from "@bindtty/layout";
import { encodeAnsiPatch } from "./ansi.js";
import { diffFrames } from "./diff.js";
import { paintLayout } from "./paint.js";
import type { Frame, RenderOptions, TerminalRenderer } from "./types.js";

export function createTerminalRenderer(): TerminalRenderer {
  let previousFrame: Frame | null = null;

  function prepare(
    root: LayoutNode | null,
    options: RenderOptions,
    resetBaseline = false
  ) {
    const nextFrame = paintLayout(root, options);
    const patch = diffFrames(resetBaseline ? null : previousFrame, nextFrame);
    const ansi = encodeAnsiPatch(patch);

    return {
      patch: ansi,
      commit() {
        previousFrame = nextFrame;
      }
    };
  }

  return {
    render(root: LayoutNode | null, options: RenderOptions): string {
      const candidate = prepare(root, options);
      candidate.commit();
      return candidate.patch;
    },

    prepare,

    reset(): void {
      previousFrame = null;
    }
  };
}
