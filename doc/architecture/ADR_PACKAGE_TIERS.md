# ADR: Public package tiers

Status: accepted for the `0.1.x` compatibility line.

## Primary public packages

- `bindtty`
- `@bindtty/widgets`
- `@bindtty/terminal`

These are the documented application entry points and receive migration notes
for user-visible compatibility changes.

## Advanced public packages

- `@bindtty/signal`
- `@bindtty/input`
- `@bindtty/text`

These expose useful standalone contracts. Their public exports are supported,
but users are expected to understand the lower-level lifecycle and data model.

## Implementation packages

- `@bindtty/vnode`
- `@bindtty/runtime`
- `@bindtty/layout`
- `@bindtty/renderer-terminal`
- `@bindtty/interaction`
- `@bindtty/jsx-runtime`
- `@bindtty/win32-input`

They remain published for composition, tooling and current compatibility, but
directory or package existence does not freeze every internal export as a
long-term independent API. Documented exports and migration periods still
apply; new internal helpers need not be promoted.

## Consequences

- The workspaces are not physically merged during M6.
- Release tooling and documentation continue to account for all 13 packages.
- Tier changes require an ADR, migration note and compatibility window.
