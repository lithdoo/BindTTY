import type {
  CreateNodeTerminalOptions,
  StdinInputAdapter
} from "../types.js";
import { ReadlineStdinInput } from "./readline-stdin.js";
import type { PlatformTerminalAdapter } from "../types.js";

export class DefaultPlatformAdapter implements PlatformTerminalAdapter {
  readonly name: string = "default";

  createStdinInput(_options: CreateNodeTerminalOptions): StdinInputAdapter {
    return new ReadlineStdinInput();
  }
}
