import {
  DefaultPlatformAdapter,
  RawStdinInput,
  type PlatformTerminalAdapter,
  type StdinInputAdapter
} from "@bindtty/terminal";

export class PtyPlatformAdapter extends DefaultPlatformAdapter {
  override readonly name: string = "pty";

  override createStdinInput(): StdinInputAdapter {
    return new RawStdinInput();
  }
}

export const ptyPlatformAdapter: PlatformTerminalAdapter = new PtyPlatformAdapter();
