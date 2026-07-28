export interface VirtualScreenOptions {
  wrapAtEol?: "delayed" | "immediate";
}

/**
 * Small ANSI screen model for renderer tests.
 *
 * It intentionally implements only the sequences emitted by BindTTY. The
 * immediate EOL mode models the Win32 console behavior that can move/scroll
 * as soon as the bottom-right cell is written.
 */
export class VirtualScreen {
  private readonly cells: string[];
  private cursorX = 0;
  private cursorY = 0;
  private autoWrap = true;
  private wrapPending = false;
  private readonly wrapAtEol: "delayed" | "immediate";

  constructor(
    readonly width: number,
    readonly height: number,
    options: VirtualScreenOptions = {}
  ) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error("VirtualScreen width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error("VirtualScreen height must be a positive integer");
    }

    this.cells = Array.from({ length: width * height }, () => " ");
    this.wrapAtEol = options.wrapAtEol ?? "delayed";
  }

  seed(lines: string[]): void {
    this.clear();

    for (let y = 0; y < Math.min(lines.length, this.height); y += 1) {
      const line = lines[y] ?? "";
      for (let x = 0; x < Math.min(line.length, this.width); x += 1) {
        this.cells[this.index(x, y)] = line[x] ?? " ";
      }
    }
  }

  write(output: string): void {
    let offset = 0;

    while (offset < output.length) {
      if (output[offset] === "\x1b" && output[offset + 1] === "[") {
        const sequence = readCsi(output, offset);
        if (!sequence) {
          throw new Error(`Unsupported ANSI sequence at offset ${offset}`);
        }
        this.applyCsi(sequence.privateMarker, sequence.params, sequence.final);
        offset += sequence.length;
        continue;
      }

      const codePoint = output.codePointAt(offset);
      if (codePoint === undefined) {
        break;
      }
      const char = String.fromCodePoint(codePoint);
      this.writeChar(char);
      offset += char.length;
    }
  }

  lines(): string[] {
    return Array.from({ length: this.height }, (_, y) =>
      this.cells
        .slice(y * this.width, (y + 1) * this.width)
        .join("")
    );
  }

  private applyCsi(
    privateMarker: string,
    params: number[],
    final: string
  ): void {
    if (final === "m") {
      return;
    }

    if (final === "H" || final === "f") {
      const row = Math.max(1, params[0] ?? 1);
      const column = Math.max(1, params[1] ?? 1);
      this.cursorY = Math.min(row - 1, this.height - 1);
      this.cursorX = Math.min(column - 1, this.width - 1);
      this.wrapPending = false;
      return;
    }

    if (final === "J" && (params[0] ?? 0) === 2) {
      this.clear();
      return;
    }

    if (privateMarker === "?" && params[0] === 7 && (final === "h" || final === "l")) {
      this.autoWrap = final === "h";
      this.wrapPending = false;
      return;
    }

    throw new Error(
      `Unsupported CSI sequence: ${privateMarker}${params.join(";")}${final}`
    );
  }

  private writeChar(char: string): void {
    if (this.wrapPending && this.autoWrap) {
      this.advanceLine();
      this.wrapPending = false;
    }

    this.cells[this.index(this.cursorX, this.cursorY)] = char;

    if (this.cursorX < this.width - 1) {
      this.cursorX += 1;
      return;
    }

    if (!this.autoWrap) {
      return;
    }

    if (this.wrapAtEol === "immediate") {
      this.advanceLine();
      return;
    }

    this.wrapPending = true;
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
    this.wrapPending = false;
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
  const match = /^\x1b\[([?]?)([\d;]*)([@-~])/.exec(output.slice(offset));
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
