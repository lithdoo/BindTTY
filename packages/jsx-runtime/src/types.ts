import type {
  BindingValue,
  Template,
  TemplateChildren,
  TemplateProps
} from "@bindtty/vnode";

export type JsxType =
  | string
  | symbol
  | ((props: Record<string, unknown>) => Template);

export type JsxProps = Record<string, unknown>;

export interface ShowProps extends JsxProps {
  when: BindingValue<boolean>;
  fallback?: Template;
  children?: TemplateChildren;
}

export interface ForProps<T = unknown> extends JsxProps {
  each: BindingValue<readonly T[]>;
  key?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => Template;
}

export type ElementProps = TemplateProps & {
  children?: TemplateChildren;
};
