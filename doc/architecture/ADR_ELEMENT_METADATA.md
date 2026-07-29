# ADR: Element metadata is the authoritative intrinsic contract

Status: accepted for M6.

## Decision

`@bindtty/vnode` owns one `elementMetadata` model covering intrinsic children,
required props, canonical names, aliases, dirty kinds, prop categories and layout
backend support. `elementSchemas` remains a compatibility projection.

Layout validation and documentation must derive alias and support matrices from
this model. JSX retains explicit value-level TypeScript types, because runtime
metadata cannot express callback signatures or binding value types, and is
checked against metadata by contract tests.

## Consequences

- Adding or renaming an intrinsic prop starts in one metadata table.
- Generated documentation is checked in CI and manual drift fails the check.
- Backend-specific support remains explicit; unsupported props are rejected.
- Metadata describes contracts, not renderer or terminal capabilities.
