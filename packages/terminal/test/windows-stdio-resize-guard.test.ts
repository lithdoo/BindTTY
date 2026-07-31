import assert from "node:assert/strict";
import test from "node:test";

interface RefreshableStdio {
  _refreshSize?: () => unknown;
}

interface GuardModule {
  acquireWindowsStdioResizeGuard(options: {
    platform: NodeJS.Platform;
    stdout: RefreshableStdio;
    stderr: RefreshableStdio;
  }): () => void;
}

async function loadGuardModule(): Promise<GuardModule> {
  const moduleUrl = new URL(
    "../../dist/windows-stdio-resize-guard.js",
    import.meta.url
  );
  return (await import(moduleUrl.href)) as GuardModule;
}

function getWindowSizeEpipe(): NodeJS.ErrnoException {
  return Object.assign(new Error("getWindowSize EPIPE"), {
    code: "EPIPE",
    syscall: "getWindowSize"
  });
}

test("Windows stdio resize guard ignores only getWindowSize EPIPE", async () => {
  const { acquireWindowsStdioResizeGuard } = await loadGuardModule();
  const epipeStream: RefreshableStdio = {
    _refreshSize() {
      throw getWindowSizeEpipe();
    }
  };
  const otherError = new Error("refresh failed");
  const failingStream: RefreshableStdio = {
    _refreshSize() {
      throw otherError;
    }
  };

  const release = acquireWindowsStdioResizeGuard({
    platform: "win32",
    stdout: epipeStream,
    stderr: failingStream
  });

  assert.doesNotThrow(() => epipeStream._refreshSize?.());
  assert.throws(() => failingStream._refreshSize?.(), otherError);
  release();
  assert.throws(() => epipeStream._refreshSize?.(), {
    code: "EPIPE",
    syscall: "getWindowSize"
  });
});

test("Windows stdio resize guard is reference counted and idempotent", async () => {
  const { acquireWindowsStdioResizeGuard } = await loadGuardModule();
  const original = () => {
    throw getWindowSizeEpipe();
  };
  const stdout: RefreshableStdio = { _refreshSize: original };
  const stderr: RefreshableStdio = {};

  const releaseFirst = acquireWindowsStdioResizeGuard({
    platform: "win32",
    stdout,
    stderr
  });
  const guarded = stdout._refreshSize;
  const releaseSecond = acquireWindowsStdioResizeGuard({
    platform: "win32",
    stdout,
    stderr
  });

  assert.equal(stdout._refreshSize, guarded);
  releaseFirst();
  releaseFirst();
  assert.equal(stdout._refreshSize, guarded);
  releaseSecond();
  assert.equal(stdout._refreshSize, original);
});

test("stdio resize guard is inactive outside Windows", async () => {
  const { acquireWindowsStdioResizeGuard } = await loadGuardModule();
  const original = () => undefined;
  const stdout: RefreshableStdio = { _refreshSize: original };

  const release = acquireWindowsStdioResizeGuard({
    platform: "linux",
    stdout,
    stderr: {}
  });

  assert.equal(stdout._refreshSize, original);
  release();
});
