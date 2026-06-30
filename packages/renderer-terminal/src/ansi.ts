import type { CellStyle, FramePatch } from "./types.js";

const RESET = "\x1b[0m";

const foregroundColors = new Map<string, number>([
  ["black", 30],
  ["red", 31],
  ["green", 32],
  ["yellow", 33],
  ["blue", 34],
  ["magenta", 35],
  ["cyan", 36],
  ["white", 37],
  ["gray", 90],
  ["brightBlack", 90],
  ["brightRed", 91],
  ["brightGreen", 92],
  ["brightYellow", 93],
  ["brightBlue", 94],
  ["brightMagenta", 95],
  ["brightCyan", 96],
  ["brightWhite", 97]
]);

const backgroundColors = new Map<string, number>([
  ["black", 40],
  ["red", 41],
  ["green", 42],
  ["yellow", 43],
  ["blue", 44],
  ["magenta", 45],
  ["cyan", 46],
  ["white", 47],
  ["gray", 100],
  ["brightBlack", 100],
  ["brightRed", 101],
  ["brightGreen", 102],
  ["brightYellow", 103],
  ["brightBlue", 104],
  ["brightMagenta", 105],
  ["brightCyan", 106],
  ["brightWhite", 107]
]);

export function encodeAnsiPatch(patch: FramePatch): string {
  if (patch.changes.length === 0) {
    return "";
  }

  let output = "";

  for (const change of patch.changes) {
    output += moveCursor(change.x, change.y);
    output += RESET;
    output += encodeStyle(change.cell.style);
    output += change.cell.char;
  }

  return output + RESET;
}

function moveCursor(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`;
}

function encodeStyle(style: CellStyle): string {
  const codes: number[] = [];

  if (style.bold === true) {
    codes.push(1);
  }

  if (style.dim === true) {
    codes.push(2);
  }

  if (style.italic === true) {
    codes.push(3);
  }

  if (style.underline === true) {
    codes.push(4);
  }

  if (style.inverse === true) {
    codes.push(7);
  }

  if (style.foreground !== undefined) {
    codes.push(readColorCode(foregroundColors, style.foreground, "foreground"));
  }

  if (style.background !== undefined) {
    codes.push(readColorCode(backgroundColors, style.background, "background"));
  }

  return codes.length === 0 ? "" : `\x1b[${codes.join(";")}m`;
}

function readColorCode(
  colors: Map<string, number>,
  color: string,
  kind: "foreground" | "background"
): number {
  const code = colors.get(color);

  if (code === undefined) {
    throw new Error(`Unsupported ${kind} color: ${color}`);
  }

  return code;
}
