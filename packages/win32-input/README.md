# @bindtty/win32-input

Optional native Windows console input provider used automatically by
`@bindtty/terminal`.

The Node-API addon reads `KEY_EVENT_RECORD` values with `ReadConsoleInputW`.
This preserves physical function keys, modifier state, repeat counts, and
Unicode without depending on PowerShell or terminal-host escape translation.
Console input mode is restored when the terminal stops.

The package is inert outside Windows. On Windows installation first loads
`prebuilds/win32-{x64,arm64}/node.napi.node`; when no matching Node-API
prebuild is packaged it compiles with `node-gyp`. The addon targets Node-API
and supports Node.js 18, 20 and 22 on Windows x64/arm64.

Only one provider may own a console input handle at a time. `dispose()` releases
the reader thread, console mode and ProviderState immediately and is idempotent.

The thread-safe callback queue defaults to 1,024 records and accepts an explicit
capacity from 16 through 65,536:

```js
createWin32InputProvider({ queueCapacity: 2048 });
```

Delivery is non-blocking. When the queue is full the newest record is dropped;
`provider.getStats().droppedRecords` exposes the cumulative overload count for
diagnostics. This avoids blocking the console reader or growing memory without
bound.

If the optional package cannot be loaded or stdin is not a console handle,
`@bindtty/terminal` safely falls back to raw VT or readline. Applications
normally do not import this package or select a backend.
