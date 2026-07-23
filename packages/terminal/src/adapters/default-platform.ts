import type {
  CreateNodeTerminalOptions,
  StdinInputAdapter
} from "../types.js";
import { RawStdinInput } from "./raw-stdin.js";
import { ReadlineStdinInput } from "./readline-stdin.js";
import type { PlatformTerminalAdapter } from "../types.js";

export class DefaultPlatformAdapter implements PlatformTerminalAdapter {
  readonly name: string = "default";

  createStdinInput(options: CreateNodeTerminalOptions): StdinInputAdapter {
    if (options.rawMode === true) {
      return new RawStdinInput(options.inputTrace);
    }

    return new ReadlineStdinInput();
  }
}
