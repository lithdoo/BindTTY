export const ANSI = {
  enterAltScreen: "\x1b[?1049h",
  exitAltScreen: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m"
} as const;
