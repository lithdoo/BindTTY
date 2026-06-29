import {
  getPropDirtyKind,
  isReadableSignal,
  type BindingValue,
  type MountedBinding,
  type MountedElementNode,
  type ReadableSignal
} from "@bindtty/vnode";
import { markDirty } from "./dirty.js";
import type { RuntimeContext } from "./types.js";

export function createBinding<T>(
  source: ReadableSignal<T>,
  onChange: (value: T, previousValue: T) => void
): MountedBinding<T> {
  const binding: MountedBinding<T> = {
    source,
    value: source.get(),
    dispose: () => {}
  };

  binding.dispose = source.subscribe((value, previousValue) => {
    binding.value = value;
    onChange(value, previousValue);
  });

  return binding;
}

export function bindProp(
  node: MountedElementNode,
  propName: string,
  source: BindingValue<unknown>,
  context?: RuntimeContext
): void {
  node.propSources[propName] = source;

  if (!isReadableSignal(source)) {
    node.props[propName] = source;
    return;
  }

  const binding = createBinding(source, (value) => {
    node.props[propName] = value;
    markDirty(node, getPropDirtyKind(node.tag, propName));
    context?.scheduler.queueDirty(node);
  });

  node.props[propName] = binding.value;
  node.bindings[propName] = binding;
}

export function bindProps(
  node: MountedElementNode,
  props: Record<string, BindingValue<unknown>>,
  context?: RuntimeContext
): void {
  for (const [propName, source] of Object.entries(props)) {
    bindProp(node, propName, source, context);
  }
}
