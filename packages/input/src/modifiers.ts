export interface ModifierFlags {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export function readXtermModifierFlags(modifier: string | undefined): ModifierFlags {
  const value = Number(modifier ?? "1");
  const mask = Number.isFinite(value) ? value - 1 : 0;

  return {
    ctrl: Boolean(mask & 4),
    meta: Boolean(mask & 2),
    shift: Boolean(mask & 1)
  };
}

export function flagsToTuple(flags: ModifierFlags): [boolean, boolean, boolean] {
  return [flags.ctrl, flags.meta, flags.shift];
}
