import type { LayoutNode } from "@bindtty/layout";
import { encodeAnsiPatch } from "./ansi.js";
import { diffFrames } from "./diff.js";
import { paintLayout } from "./paint.js";
import type { Frame, RenderOptions, TerminalRenderer } from "./types.js";

export function createTerminalRenderer(): TerminalRenderer {
  let previousFrame: Frame | null = null;

  return {
    render(root: LayoutNode | null, options: RenderOptions): string {
      const nextFrame = paintLayout(root, options);
      const patch = diffFrames(previousFrame, nextFrame);
      const ansi = encodeAnsiPatch(patch);

      previousFrame = nextFrame;

      return ansi;
    },

    reset(): void {
      previousFrame = null;
    }
  };
}
