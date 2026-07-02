import fs from "node:fs";

export class MarkerLog {
  constructor(private readonly filePath: string) {}

  static create(filePath: string): MarkerLog {
    fs.writeFileSync(filePath, "");
    return new MarkerLog(filePath);
  }

  readLines(): string[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return fs
      .readFileSync(this.filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  }

  has(line: string): boolean {
    return this.readLines().includes(line);
  }

  waitFor(
    line: string,
    options: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const intervalMs = options.intervalMs ?? 50;
    const started = Date.now();

    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (error?: Error): void => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      const tick = (): void => {
        if (this.has(line)) {
          finish();
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          finish(
            new Error(
              `Timed out waiting for marker ${line}. Got: ${this.readLines().join(", ")}`
            )
          );
          return;
        }

        timer = setTimeout(tick, intervalMs);
      };

      tick();
    });
  }

  cleanup(): void {
    try {
      fs.unlinkSync(this.filePath);
    } catch {
      // ignore
    }
  }
}
