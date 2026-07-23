import type { InputProtocol } from "./semantic-events.js";

export interface KeyboardCapabilities {
  protocol: InputProtocol;
  modifiedEnter: boolean;
  functionKeys: boolean;
  distinguishEscape: boolean;
  leftRightModifiers: boolean;
  keyRepeat: boolean;
  paste: boolean;
}

export function keyboardCapabilitiesForProtocol(
  protocol: InputProtocol
): KeyboardCapabilities {
  switch (protocol) {
    case "kitty":
      return {
        protocol,
        modifiedEnter: true,
        functionKeys: true,
        distinguishEscape: true,
        leftRightModifiers: false,
        keyRepeat: true,
        paste: true
      };
    case "win32":
      return {
        protocol,
        modifiedEnter: true,
        functionKeys: true,
        distinguishEscape: true,
        leftRightModifiers: true,
        keyRepeat: true,
        paste: false
      };
    case "modify-other-keys":
      return {
        protocol,
        modifiedEnter: true,
        functionKeys: true,
        distinguishEscape: false,
        leftRightModifiers: false,
        keyRepeat: false,
        paste: true
      };
    case "windows-vt":
    case "legacy-vt":
      return {
        protocol,
        modifiedEnter: false,
        functionKeys: true,
        distinguishEscape: false,
        leftRightModifiers: false,
        keyRepeat: false,
        paste: true
      };
    case "readline":
      return {
        protocol,
        modifiedEnter: false,
        functionKeys: true,
        distinguishEscape: false,
        leftRightModifiers: false,
        keyRepeat: false,
        paste: false
      };
  }
}
