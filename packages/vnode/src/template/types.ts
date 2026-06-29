export type Dispose = () => void;
export type SignalListener<T> = (value: T, previousValue: T) => void;

export interface ReadableSignal<T> {
  get(): T;
  subscribe(listener: SignalListener<T>): Dispose;
}

export type BindingValue<T> = T | ReadableSignal<T>;

export type Template =
  | EmptyTemplate
  | ElementTemplate
  | FragmentTemplate
  | ComponentTemplate
  | ShowTemplate
  | ForTemplate<any>;

export type ViewTemplate = Template;

export interface EmptyTemplate {
  kind: "empty";
}

export interface ElementTemplate {
  kind: "element";
  tag: IntrinsicElementTag;
  props: TemplateProps;
  children: Template[];
}

export interface FragmentTemplate {
  kind: "fragment";
  children: Template[];
}

export type FunctionComponent<P = Record<string, unknown>> = (props: P) => Template;

export interface ComponentTemplate<P = Record<string, unknown>> {
  kind: "component";
  component: FunctionComponent<P>;
  props: P;
}

export interface ShowTemplate {
  kind: "show";
  when: BindingValue<boolean>;
  children: Template;
  fallback?: Template;
}

export interface ForTemplate<T = unknown> {
  kind: "for";
  each: BindingValue<readonly T[]>;
  key?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => Template;
}

export type TemplateProps = Record<string, BindingValue<unknown>>;

export type IntrinsicElementTag =
  | "screen"
  | "box"
  | "vstack"
  | "hstack"
  | "text"
  | "button"
  | "input"
  | "spacer";

export type TemplateChild =
  | Template
  | null
  | undefined
  | false
  | readonly TemplateChild[];

export type TemplateChildren = TemplateChild | readonly TemplateChild[];
