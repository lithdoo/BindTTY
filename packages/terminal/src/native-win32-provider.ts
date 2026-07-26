import { createRequire } from "node:module";

import type { Win32InputProvider } from "./types.js";

interface NativeWin32InputModule {
  createWin32InputProvider(): Win32InputProvider | null;
}

type NativeWin32InputLoader = () => unknown;

const require = createRequire(import.meta.url);

export function discoverNativeWin32InputProvider(
  platform = process.platform,
  load: NativeWin32InputLoader = loadOptionalNativeModule
): Win32InputProvider | undefined {
  if (platform !== "win32") {
    return undefined;
  }

  try {
    const module = load() as Partial<NativeWin32InputModule> | null;
    if (!module || typeof module.createWin32InputProvider !== "function") {
      return undefined;
    }

    const provider = module.createWin32InputProvider();
    if (!isWin32InputProvider(provider)) {
      return undefined;
    }

    if (
      typeof provider.isAvailable === "function" &&
      !provider.isAvailable()
    ) {
      return undefined;
    }

    return provider;
  } catch {
    return undefined;
  }
}

function loadOptionalNativeModule(): unknown {
  return require("@bindtty/win32-input");
}

function isWin32InputProvider(
  value: Win32InputProvider | null | undefined
): value is Win32InputProvider {
  return value !== null &&
    value !== undefined &&
    typeof value.attach === "function";
}
