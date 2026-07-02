import { stdin as processStdin } from "node:process";

import type { CreateNodeTerminalOptions, StdinInputAdapter } from "../types.js";
import { DefaultPlatformAdapter } from "./default-platform.js";
import { RawStdinInput } from "./raw-stdin.js";

export class Win32PlatformAdapter extends DefaultPlatformAdapter {
  override readonly name: string = "win32";

  override createStdinInput(
    options: CreateNodeTerminalOptions
  ): StdinInputAdapter {
    if (options.stdin === processStdin) {
      return new RawStdinInput();
    }

    return super.createStdinInput(options);
  }
}
