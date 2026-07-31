import type {
  CreateNodeTerminalOptions,
  StdinInputAdapter,
  StdinInputContext
} from "../types.js";
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
    options: CreateNodeTerminalOptions,
    context?: StdinInputContext
  ): StdinInputAdapter {
    const selection =
      context?.inputBackend ??
      selectInputBackend(
        options,
        detectTerminalInputEnvironment(options, { platform: "win32" })
      );

    if (selection.stdinAdapter === "win32" && options.win32InputProvider) {
      return new Win32ConsoleInput(
        options.win32InputProvider,
        options.inputTrace,
        context?.responseRouter
      );
    }

    if (selection.stdinAdapter === "raw") {
      return new RawStdinInput(options.inputTrace, {
        escapeAmbiguityTimeoutMs: options.escapeAmbiguityTimeoutMs,
        maxPasteCodeUnits: options.maxPasteCodeUnits,
        clock: options.inputClock
      });
    }

    return new ReadlineStdinInput();
  }
}
