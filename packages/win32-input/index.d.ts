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
}

export function createWin32InputProvider(): Win32InputProvider | null;
