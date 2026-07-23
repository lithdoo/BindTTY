import { stdin as processStdin } from "node:process";

import type { CreateNodeTerminalOptions, StdinInputAdapter } from "../types.js";
import { DefaultPlatformAdapter } from "./default-platform.js";
import { RawStdinInput } from "./raw-stdin.js";
import { Win32ConsoleInput } from "./win32-console-input.js";

export class Win32PlatformAdapter extends DefaultPlatformAdapter {
  override readonly name: string = "win32";

  override createStdinInput(
    options: CreateNodeTerminalOptions
  ): StdinInputAdapter {
    if (options.win32InputProvider) {
      return new Win32ConsoleInput(options.win32InputProvider);
    }

    if (options.rawMode === true || options.stdin === processStdin) {
      return new RawStdinInput(options.inputTrace);
    }

    return super.createStdinInput(options);
  }
}
