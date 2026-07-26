# @bindtty/win32-input

Optional native Windows console input provider used automatically by
`@bindtty/terminal`.

The Node-API addon reads `KEY_EVENT_RECORD` values with `ReadConsoleInputW`.
This preserves physical function keys, modifier state, repeat counts, and
Unicode without depending on PowerShell or terminal-host escape translation.
Console input mode is restored when the terminal stops.

The package is inert outside Windows. On Windows it compiles during install
with `node-gyp`; if the optional package cannot be built or stdin is not a
console handle, `@bindtty/terminal` safely falls back to raw VT or readline.
Applications normally do not import this package or select a backend.
