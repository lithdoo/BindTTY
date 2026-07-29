import {
  elementMetadata,
  type ElementDirtyKind
} from "./element-metadata.js";
import type { IntrinsicElementTag } from "./types.js";

export type DirtyKind = ElementDirtyKind;

export interface PropSchema {
  required?: boolean;
  dirty?: DirtyKind;
}

export interface ElementSchema {
  acceptsChildren: boolean;
  requiredProps?: string[];
  props?: Record<string, PropSchema>;
}

/** Compatibility view derived from the authoritative element metadata. */
export const elementSchemas = Object.fromEntries(
  Object.entries(elementMetadata).map(([tag, metadata]) => [
    tag,
    {
      acceptsChildren: metadata.acceptsChildren,
      requiredProps: Object.entries(metadata.props)
        .filter(([name, prop]) => name === prop.canonical && prop.required)
        .map(([name]) => name),
      props: Object.fromEntries(
        Object.entries(metadata.props).map(([name, prop]) => [
          name,
          { required: prop.required, dirty: prop.dirty }
        ])
      )
    }
  ])
) as Record<IntrinsicElementTag, ElementSchema>;

export function getElementSchema(tag: IntrinsicElementTag): ElementSchema {
  return elementSchemas[tag];
}

export function getPropDirtyKind(
  tag: IntrinsicElementTag,
  propName: string
): DirtyKind {
  return elementMetadata[tag].props[propName]?.dirty ?? "paint";
}
