# ADR: BasicLayoutEngine remains a public fallback

Status: accepted for the `0.1.x` compatibility line.

## Decision

`createBasicLayoutEngine()` remains an advanced public fallback and deterministic
test engine. Yoga remains the default and is allowed to support a larger prop
set.

BindTTY promises cross-backend contract tests only for capabilities declared by
both engines. Basic rejects Yoga-only props instead of silently approximating
them. Backend support and aliases now come from the shared element metadata;
engine implementations retain only their algorithms.

## Consequences

- Basic `scrollX` and `scrollY` both clamp to `contentSize - contentRect`.
- Common clipping, content size, text measurement and scroll metadata stay
  covered by contract tests.
- Removing or internalizing Basic requires a later deprecation period,
  migration note and changelog entry.
- Backend-specific intrinsic sizing can differ where Yoga shrink/flex behavior
  is not part of Basic's declared capability set.
- A persistent Yoga tree is deferred. Current runtime layout nodes are immutable
  snapshots, while Yoga nodes require mutation and explicit lifetime ownership;
  no benchmark yet isolates Yoga allocation as the dominant frame cost.
