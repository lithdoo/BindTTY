# @bindtty/terminal

Terminal lifecycle and input host package for BindTTY.

Responsibilities:

- stdout write / viewport / resize
- alt screen and cursor lifecycle
- stdin raw mode lifecycle
- optional enhanced keyboard protocol setup / restore
- stdin input adapters

Raw keyboard protocol parsing lives in `@bindtty/input`. `RawStdinInput` holds a `createInputParser()` instance and dispatches parsed key events.

See:

- [../../doc/packages/TERMINAL.md](../../doc/packages/TERMINAL.md)
- [../../doc/packages/INPUT.md](../../doc/packages/INPUT.md)
