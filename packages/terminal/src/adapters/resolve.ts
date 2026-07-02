import type { CreateNodeTerminalOptions, PlatformTerminalAdapter } from "../types.js";
import { DefaultPlatformAdapter } from "./default-platform.js";
import { FixedStdinPlatformAdapter } from "./fixed-stdin-platform.js";
import { Win32PlatformAdapter } from "./win32-platform.js";

const defaultPlatform = new DefaultPlatformAdapter();
const win32Platform = new Win32PlatformAdapter();

export function resolvePlatformAdapter(
  options: CreateNodeTerminalOptions
): PlatformTerminalAdapter {
  if (options.platformAdapter) {
    return options.platformAdapter;
  }

  if (options.stdinInputAdapter) {
    return new FixedStdinPlatformAdapter(options.stdinInputAdapter);
  }

  if (process.platform === "win32") {
    return win32Platform;
  }

  return defaultPlatform;
}
