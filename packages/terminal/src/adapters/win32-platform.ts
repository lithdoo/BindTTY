import type { CreateNodeTerminalOptions, StdinInputAdapter } from "../types.js";
import {
  detectTerminalInputEnvironment,
  selectInputBackend
} from "../backend-selection.js";
import { DefaultPlatformAdapter } from "./default-platform.js";
import { ReadlineStdinInput } from "./readline-stdin.js";
import { RawStdinInput } from "./raw-stdin.js";
import { Win32ConsoleInput } from "./win32-console-input.js";

export class Win32PlatformAdapter extends DefaultPlatformAdapter {
  override readonly name: string = "win32";

  override createStdinInput(
    options: CreateNodeTerminalOptions
  ): StdinInputAdapter {
    const selection = selectInputBackend(
      options,
      detectTerminalInputEnvironment(options, { platform: "win32" })
    );

    if (selection.stdinAdapter === "win32" && options.win32InputProvider) {
      return new Win32ConsoleInput(
        options.win32InputProvider,
        options.inputTrace
      );
    }

    if (selection.stdinAdapter === "raw") {
      return new RawStdinInput(options.inputTrace, {
        escapeAmbiguityTimeoutMs: options.escapeAmbiguityTimeoutMs,
        maxPasteCodeUnits: options.maxPasteCodeUnits
      });
    }

    return new ReadlineStdinInput();
  }
}
