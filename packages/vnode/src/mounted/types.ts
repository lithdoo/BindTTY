import type {
  BindingValue,
  IntrinsicElementTag,
  ReadableSignal,
  Template
} from "../template/types.js";
import type { DirtyKind } from "../template/schema.js";

export type MountedNode =
  | MountedElementNode
  | MountedFragmentNode
  | MountedShowNode
  | MountedForNode;

export interface MountedBinding<T = unknown> {
  source: ReadableSignal<T>;
  value: T;
  dispose: () => void;
}

export type MountedElementRefHandler<TLayout = unknown> = (
  api: MountedElementApi<TLayout>
) => void;

export interface MountedElementApi<TLayout = unknown> {
  readonly tag: IntrinsicElementTag;
  readonly id: string | number | undefined;

  getProp(name: string): unknown;
  getLayout(): TLayout | null;
  focus(): unknown;
  isFocused(): boolean;

  onMounted?: () => void;
  onLayout?: (layout: TLayout) => void;
  onUnmount?: () => void;
}

export interface MountedNodeBase {
  dirty: DirtyKind | null;
  dispose(): void;
}

export interface MountedElementNode extends MountedNodeBase {
  kind: "element";
  tag: IntrinsicElementTag;
  props: Record<string, unknown>;
  propSources: Record<string, BindingValue<unknown>>;
  bindings: Record<string, MountedBinding>;
  children: MountedNode[];
  state: Record<string, unknown>;
  api?: MountedElementApi;
}

export interface MountedFragmentNode extends MountedNodeBase {
  kind: "fragment";
  children: MountedNode[];
}

export interface MountedShowNode extends MountedNodeBase {
  kind: "show";
  when: BindingValue<boolean>;
  activeBranch: MountedNode | null;
  activeTemplate: Template | null;
  binding?: MountedBinding<boolean>;
}

export interface MountedForItemNode<T = unknown> {
  key: string | number;
  item: T;
  node: MountedNode;
}

export interface MountedForNode<T = unknown> extends MountedNodeBase {
  kind: "for";
  each: BindingValue<readonly T[]>;
  items: MountedForItemNode<T>[];
  binding?: MountedBinding<readonly T[]>;
}
