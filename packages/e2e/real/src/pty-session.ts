import { stripVTControlCharacters } from "node:util";

import type { IDisposable, IPty } from "node-pty";
import * as pty from "node-pty";

import { MarkerLog } from "./marker-log.js";

export interface PtySessionOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  markerFile: string;
}

export interface PtySessionResult {
  exitCode: number | null;
  output: string;
  visibleOutput: string;
  markers: string[];
}

export class PtySession {
  private output = "";
  private exitCode: number | null = null;
  private exited = false;
  private disposed = false;
  private exitTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly exitPromise: Promise<void>;
  private readonly pty: IPty;
  private readonly dataDisposable: IDisposable;
  private exitDisposable!: IDisposable;

  constructor(private readonly options: PtySessionOptions) {
    this.pty = pty.spawn(this.options.command, this.options.args, {
      name: "xterm-256color",
      cols: this.options.cols ?? 80,
      rows: this.options.rows ?? 24,
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        BINDTTY_E2E_MARKER: this.options.markerFile,
        TERM: "xterm-256color",
        FORCE_COLOR: "0"
      }
    });

    this.dataDisposable = this.pty.onData((chunk) => {
      this.output += chunk;
    });

    this.exitPromise = new Promise((resolve) => {
      this.exitDisposable = this.pty.onExit(({ exitCode }) => {
        this.exitCode = exitCode;
        this.exited = true;
        resolve();
      });
    });
  }

  write(data: string): void {
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
  }

  async waitForExit(timeoutMs = 15_000): Promise<number | null> {
    try {
      await Promise.race([
        this.exitPromise,
        new Promise<void>((_resolve, reject) => {
          this.exitTimer = setTimeout(() => {
            reject(new Error("PTY harness timed out"));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (this.exitTimer) {
        clearTimeout(this.exitTimer);
        this.exitTimer = undefined;
      }
    }

    return this.exitCode;
  }

  kill(): void {
    if (!this.exited && !this.disposed) {
      this.pty.kill();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.exitTimer) {
      clearTimeout(this.exitTimer);
      this.exitTimer = undefined;
    }

    this.kill();
    this.dataDisposable.dispose();
    this.exitDisposable.dispose();
  }

  getVisibleOutput(): string {
    return stripVTControlCharacters(this.output);
  }

  async finish(marker: MarkerLog, timeoutMs = 15_000): Promise<PtySessionResult> {
    let exitCode: number | null;

    try {
      exitCode = await this.waitForExit(timeoutMs);
    } catch (error) {
      this.dispose();
      throw error;
    }

    return {
      exitCode,
      output: this.output,
      visibleOutput: this.getVisibleOutput(),
      markers: marker.readLines()
    };
  }
}

export function resolveNodeBinary(): string {
  return process.execPath;
}
