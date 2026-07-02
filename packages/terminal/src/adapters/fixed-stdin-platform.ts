import type {
  CreateNodeTerminalOptions,
  PlatformTerminalAdapter,
  StdinInputAdapter
} from "../types.js";

export class FixedStdinPlatformAdapter implements PlatformTerminalAdapter {
  readonly name: string = "fixed-stdin";

  constructor(private readonly stdinInput: StdinInputAdapter) {}

  createStdinInput(_options: CreateNodeTerminalOptions): StdinInputAdapter {
    return this.stdinInput;
  }
}
