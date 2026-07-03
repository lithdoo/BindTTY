export type {
  BindingValue,
  ComponentTemplate,
  Dispose,
  ElementTemplate,
  EmptyTemplate,
  ForTemplate,
  FragmentTemplate,
  FunctionComponent,
  IntrinsicElementTag,
  ReadableSignal,
  ShowTemplate,
  SignalListener,
  Template,
  TemplateChild,
  TemplateChildren,
  TemplateProps,
  ViewTemplate
} from "./template/types.js";

export {
  componentTemplate,
  elementTemplate,
  emptyTemplate,
  forTemplate,
  fragmentTemplate,
  isTemplate,
  normalizeChildren,
  normalizeSingleTemplate,
  showTemplate,
  validateElementTemplate
} from "./template/normalize.js";

export { isReadableSignal, resolveBindingValue } from "./template/binding.js";

export {
  elementSchemas,
  getElementSchema,
  getPropDirtyKind
} from "./template/schema.js";

export type { DirtyKind, ElementSchema, PropSchema } from "./template/schema.js";

export type {
  MountedBinding,
  MountedElementApi,
  MountedElementNode,
  MountedElementRefHandler,
  MountedForItemNode,
  MountedForNode,
  MountedFragmentNode,
  MountedNode,
  MountedNodeBase,
  MountedShowNode
} from "./mounted/types.js";
