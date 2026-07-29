import type {
  CreateNodeTerminalOptions,
  StdinInputAdapter
} from "../types.js";
import { RawStdinInput } from "./raw-stdin.js";
import { ReadlineStdinInput } from "./readline-stdin.js";
import type { PlatformTerminalAdapter } from "../types.js";
import { selectInputBackend } from "../backend-selection.js";

export class DefaultPlatformAdapter implements PlatformTerminalAdapter {
  readonly name: string = "default";

  createStdinInput(options: CreateNodeTerminalOptions): StdinInputAdapter {
    if (selectInputBackend(options).stdinAdapter === "raw") {
      return new RawStdinInput(options.inputTrace, {
        escapeAmbiguityTimeoutMs: options.escapeAmbiguityTimeoutMs
      });
    }

    return new ReadlineStdinInput();
  }
}
