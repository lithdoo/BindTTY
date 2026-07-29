import type { TerminalHost } from "@bindtty/terminal";
import type { Dispose } from "@bindtty/runtime";

export type FrameWriteResult = "accepted" | "blocked";

export interface FrameSink {
  write(frame: string): FrameWriteResult;
  onWritable?(listener: () => void): Dispose;
}

interface StdoutFrameTarget {
  write(chunk: string): unknown;
  on?(event: "drain", listener: () => void): unknown;
  off?(event: "drain", listener: () => void): unknown;
}

export function createTerminalFrameSink(terminal: TerminalHost): FrameSink {
  const sink: FrameSink = {
    write(frame) {
      const accepted = terminal.write(frame);
      if (accepted === false && !sink.onWritable) {
        throw new Error("Blocked FrameSink must provide onWritable()");
      }
      return accepted === false ? "blocked" : "accepted";
    }
  };
  if (terminal.onDrain) {
    sink.onWritable = (listener) => terminal.onDrain!(listener);
  }
  return sink;
}

export function createStdoutFrameSink(stdout: StdoutFrameTarget): FrameSink {
  const sink: FrameSink = {
    write(frame) {
      const accepted = stdout.write(frame);
      if (accepted === false && !sink.onWritable) {
        throw new Error("Blocked FrameSink must provide onWritable()");
      }
      return accepted === false ? "blocked" : "accepted";
    }
  };
  if (stdout.on && stdout.off) {
    sink.onWritable = (listener) => {
      stdout.on!("drain", listener);
      return () => {
        stdout.off!("drain", listener);
      };
    };
  }
  return sink;
}
