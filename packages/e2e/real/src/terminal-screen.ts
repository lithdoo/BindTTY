import { segmentText } from "@bindtty/text";

export class TerminalScreen {
  private cells: string[];
  private cursorX = 0;
  private cursorY = 0;
  private autoWrap = true;
  private pending = "";

  constructor(
    private width: number,
    private height: number
  ) {
    validateSize(width, height);
    this.cells = createBlankCells(width, height);
  }

  write(chunk: string): void {
    this.pending += chunk;
    let offset = 0;

    while (offset < this.pending.length) {
      const escapeOffset = this.pending.indexOf("\x1b", offset);
      if (escapeOffset === -1) {
        break;
      }

      if (escapeOffset > offset) {
        this.writeText(this.pending.slice(offset, escapeOffset));
      }

      const sequence = readCsi(this.pending, escapeOffset);
      if (!sequence) {
        offset = escapeOffset;
        break;
      }

      this.applyCsi(sequence);
      offset = escapeOffset + sequence.length;
    }

    this.pending = this.pending.slice(offset);
  }

  resize(width: number, height: number): void {
    validateSize(width, height);
    this.flushPlainText();

    const previousCells = this.cells;
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = width;
    this.height = height;
    this.cells = createBlankCells(width, height);

    for (let y = 0; y < Math.min(previousHeight, height); y += 1) {
      for (let x = 0; x < Math.min(previousWidth, width); x += 1) {
        this.cells[this.index(x, y)] =
          previousCells[y * previousWidth + x] ?? " ";
      }
    }

    this.cursorX = Math.min(this.cursorX, width - 1);
    this.cursorY = Math.min(this.cursorY, height - 1);
  }

  lines(): string[] {
    this.flushPlainText();
    return Array.from({ length: this.height }, (_, y) =>
      this.cells
        .slice(y * this.width, (y + 1) * this.width)
        .join("")
    );
  }

  private flushPlainText(): void {
    if (this.pending === "" || this.pending.includes("\x1b")) {
      return;
    }

    this.writeText(this.pending);
    this.pending = "";
  }

  private applyCsi(sequence: CsiSequence): void {
    const { privateMarker, params, final } = sequence;

    if (final === "H" || final === "f") {
      const row = Math.max(1, params[0] ?? 1);
      const column = Math.max(1, params[1] ?? 1);
      this.cursorY = Math.min(row - 1, this.height - 1);
      this.cursorX = Math.min(column - 1, this.width - 1);
      return;
    }

    if (final === "J" && (params[0] ?? 0) === 2) {
      this.clear();
      return;
    }

    if (
      privateMarker === "?" &&
      params[0] === 7 &&
      (final === "h" || final === "l")
    ) {
      this.autoWrap = final === "h";
      return;
    }

    if (
      privateMarker === "?" &&
      params[0] === 1049 &&
      final === "h"
    ) {
      this.clear();
    }
  }

  private writeText(text: string): void {
    for (const segment of segmentText(text)) {
      if (segment.text === "\r") {
        this.cursorX = 0;
        continue;
      }

      if (segment.text === "\n") {
        this.advanceLine();
        continue;
      }

      if (segment.width === 0) {
        this.appendCombiningSegment(segment.text);
        continue;
      }

      if (segment.width === 2 && this.cursorX === this.width - 1) {
        continue;
      }

      this.cells[this.index(this.cursorX, this.cursorY)] = segment.text;
      if (segment.width === 2) {
        this.cells[this.index(this.cursorX + 1, this.cursorY)] = "";
      }

      const nextX = this.cursorX + segment.width;
      if (nextX < this.width) {
        this.cursorX = nextX;
        continue;
      }

      this.cursorX = this.width - 1;
      if (this.autoWrap) {
        this.advanceLine();
      }
    }
  }

  private appendCombiningSegment(text: string): void {
    const previousX = Math.max(0, this.cursorX - 1);
    const index = this.index(previousX, this.cursorY);
    this.cells[index] = (this.cells[index] ?? "") + text;
  }

  private advanceLine(): void {
    this.cursorX = 0;
    if (this.cursorY < this.height - 1) {
      this.cursorY += 1;
      return;
    }

    this.cells.splice(0, this.width);
    this.cells.push(...Array.from({ length: this.width }, () => " "));
  }

  private clear(): void {
    this.cells.fill(" ");
    this.cursorX = 0;
    this.cursorY = 0;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }
}

interface CsiSequence {
  privateMarker: string;
  params: number[];
  final: string;
  length: number;
}

function readCsi(output: string, offset: number): CsiSequence | null {
  const match = /^\x1b\[([?<>]?)([\d;]*)([@-~])/.exec(output.slice(offset));
  if (!match) {
    return null;
  }

  const rawParams = match[2] ?? "";
  return {
    privateMarker: match[1] ?? "",
    params:
      rawParams === ""
        ? []
        : rawParams.split(";").map((value) => Number(value)),
    final: match[3] ?? "",
    length: match[0].length
  };
}

function createBlankCells(width: number, height: number): string[] {
  return Array.from({ length: width * height }, () => " ");
}

function validateSize(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("TerminalScreen width must be a positive integer");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("TerminalScreen height must be a positive integer");
  }
}
