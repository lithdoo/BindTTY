export const ANSI = {
  enterAltScreen: "\x1b[?1049h",
  exitAltScreen: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  enableKittyKeyboard: "\x1b[>1u",
  disableKittyKeyboard: "\x1b[<u",
  enableModifyOtherKeys: "\x1b[>4;2m",
  disableModifyOtherKeys: "\x1b[>4;0m",
  reset: "\x1b[0m"
} as const;
