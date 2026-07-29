export interface Win32KeyRecord {
  keyDown: boolean;
  virtualKeyCode: number;
  scanCode: number;
  unicode: string;
  controlKeyState: number;
  repeatCount: number;
}

export interface Win32InputProvider {
  isAvailable(): boolean;
  attach(listener: (record: Win32KeyRecord) => void): () => void;
  getStats(): {
    queueCapacity: number;
    droppedRecords: bigint;
  };
}

export interface Win32InputProviderOptions {
  queueCapacity?: number;
}

export const DEFAULT_QUEUE_CAPACITY: 1024;
export function bindingCandidatePaths(
  platform?: NodeJS.Platform,
  arch?: string
): string[];
export function createWin32InputProvider(
  options?: Win32InputProviderOptions
): Win32InputProvider | null;
