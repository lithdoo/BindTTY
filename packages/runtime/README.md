# @bindtty/runtime

Runtime mount and binding layer for BindTTY.

It mounts `@bindtty/vnode` templates into long-lived mounted nodes, resolves binding values, subscribes to readable signals, marks dirty nodes, and disposes runtime resources.

## Keyed `For` contract

Keys identify item ownership; they do not imply that an item's content is
immutable. Reusing the same key with the same object preserves the mounted
subtree, including local state. Reusing the same key with a different item
object replaces that item's local subtree so updated fields become visible.
Duplicate keys are rejected on both initial mount and later updates.
