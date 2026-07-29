import assert from 'node:assert/strict';
import test from 'node:test';

import { batch, computed, createSignal, effect } from '../dist/index.js';
import {
  createReactiveOwner,
  disposeReactiveOwner,
  getCurrentOwner,
  runWithOwner
} from '../dist/internal.js';

test('signal stores values and notifies subscribers', () => {
  // 基础 signal 应该支持读取、写入，以及显式订阅。
  const count = createSignal(0);
  const changes = [];

  const unsubscribe = count.subscribe((value, previousValue) => {
    changes.push([value, previousValue]);
  });

  count.set(1);
  count.set(count.get() + 1);
  // 设置为相同值时不应该重复通知，这能避免无意义的重算和渲染。
  count.set(2);
  unsubscribe();
  // 取消订阅后，signal 本身仍然可以更新，但 listener 不再收到通知。
  count.set(3);

  assert.equal(count.get(), 3);
  assert.deepEqual(changes, [
    [1, 0],
    [2, 1]
  ]);
});

test('computed tracks dependencies and updates derived values', () => {
  // computed 会在执行 derive 函数时自动追踪 count.get()。
  const count = createSignal(2);
  const doubled = computed(() => count.get() * 2);
  // computed 也可以依赖另一个 computed，形成派生链。
  const plusOne = computed(() => doubled.get() + 1);

  assert.equal(plusOne.get(), 5);

  // 更新源 signal 后，doubled 和 plusOne 都应该同步变成最新值。
  count.set(4);

  assert.equal(doubled.get(), 8);
  assert.equal(plusOne.get(), 9);
});

test('effect runs immediately, reacts to changes, and disposes', () => {
  // effect 创建时会立即执行一次，并把执行期间读取的 signal 记录为依赖。
  const count = createSignal(0);
  const values = [];

  const dispose = effect(() => {
    values.push(count.get());
  });

  count.set(1);
  count.set(2);
  dispose();
  // dispose 后 effect 已经解绑依赖，不应该再响应后续更新。
  count.set(3);

  assert.deepEqual(values, [0, 1, 2]);
});

test('dependencies are collected dynamically on every run', () => {
  // 这个测试覆盖最容易出错的场景：computed 的依赖不是固定的，而是由分支决定。
  const useA = createSignal(true);
  const a = createSignal('a0');
  const b = createSignal('b0');
  const selected = computed(() => (useA.get() ? a.get() : b.get()));

  assert.equal(selected.get(), 'a0');

  // 当前分支读取的是 a，所以更新 b 不应该影响 selected。
  b.set('b1');
  assert.equal(selected.get(), 'a0');

  // 切换分支后，computed 重新运行：旧依赖 a 会被清理，新依赖 b 会被收集。
  useA.set(false);
  assert.equal(selected.get(), 'b1');

  // 如果旧依赖没有被正确清理，这里会错误地触发 selected 更新。
  a.set('a1');
  assert.equal(selected.get(), 'b1');

  // 当前真实依赖是 b，所以更新 b 应该生效。
  b.set('b2');
  assert.equal(selected.get(), 'b2');
});

test('effect cleanup runs before rerun and on dispose', () => {
  // cleanup 用来释放上一轮 effect 创建的资源，例如事件监听、订阅、定时器等。
  const count = createSignal(0);
  const events = [];

  const dispose = effect(() => {
    const value = count.get();
    events.push(`run:${value}`);
    return () => {
      events.push(`cleanup:${value}`);
    };
  });

  count.set(1);
  // dispose 时应该执行最后一次 cleanup。
  dispose();

  assert.deepEqual(events, ['run:0', 'cleanup:0', 'run:1', 'cleanup:1']);
});

test('computed is lazy and a dormant read does not retain upstream subscriptions', () => {
  const source = createSignal(1);
  let derives = 0;
  const derived = computed(() => {
    derives += 1;
    return source.get() * 2;
  });

  assert.equal(derives, 0);
  assert.equal(derived.get(), 2);
  assert.equal(derives, 1);

  source.set(2);
  assert.equal(derives, 1);
  assert.equal(derived.get(), 4);
  assert.equal(derives, 2);
});

test('computed subscribes while consumed and releases upstream after the last consumer', () => {
  const source = createSignal(1);
  let derives = 0;
  const derived = computed(() => {
    derives += 1;
    return source.get() * 2;
  });
  const changes = [];

  const unsubscribe = derived.subscribe((value, previousValue) => {
    changes.push([value, previousValue]);
  });
  assert.equal(derives, 1);

  source.set(2);
  assert.equal(derives, 2);
  assert.deepEqual(changes, [[4, 2]]);

  unsubscribe();
  source.set(3);
  assert.equal(derives, 2);
  assert.equal(derived.get(), 6);
  assert.equal(derives, 3);
});

test('nested computed restores dynamic dependencies after becoming active again', () => {
  const chooseLeft = createSignal(true);
  const left = createSignal(1);
  const right = createSignal(10);
  const selected = computed(() => chooseLeft.get() ? left.get() : right.get());
  const doubled = computed(() => selected.get() * 2);
  const values = [];

  const dispose = effect(() => {
    values.push(doubled.get());
  });

  chooseLeft.set(false);
  left.set(2);
  right.set(11);
  dispose();
  right.set(12);

  assert.deepEqual(values, [2, 20, 22]);
  assert.equal(doubled.get(), 24);
});

test('diamond dependencies never expose an intermediate value to effects', () => {
  const source = createSignal(1);
  const left = computed(() => source.get() * 2);
  const right = computed(() => source.get() * 3);
  const snapshots = [];

  const dispose = effect(() => {
    snapshots.push([left.get(), right.get()]);
  });
  source.set(2);
  dispose();

  assert.deepEqual(snapshots, [
    [2, 3],
    [4, 6]
  ]);
});

test('batch coalesces effects and listener old/new values and returns callback result', () => {
  const source = createSignal(0);
  const effects = [];
  const changes = [];
  const dispose = effect(() => {
    effects.push(source.get());
  });
  source.subscribe((value, previousValue) => {
    changes.push([value, previousValue]);
  });

  const result = batch(() => {
    source.set(1);
    source.set(2);
    return 'done';
  });
  dispose();

  assert.equal(result, 'done');
  assert.deepEqual(effects, [0, 2]);
  assert.deepEqual(changes, [[2, 0]]);
});

test('get returns the final derived value synchronously inside a batch', () => {
  const source = createSignal(1);
  const derived = computed(() => source.get() * 2);
  const dispose = derived.subscribe(() => {});

  batch(() => {
    source.set(3);
    assert.equal(derived.get(), 6);
  });

  dispose();
});

test('effect set is queued instead of recursively running the same effect', () => {
  const source = createSignal(0);
  const values = [];
  let activeRuns = 0;

  const dispose = effect(() => {
    activeRuns += 1;
    assert.equal(activeRuns, 1);
    const value = source.get();
    values.push(value);
    if (value < 2) {
      source.set(value + 1);
    }
    activeRuns -= 1;
  });
  dispose();

  assert.deepEqual(values, [0, 1, 2]);
});

test('computed cycles throw a stable diagnostic and can be retried', () => {
  let cyclic;
  cyclic = computed(() => cyclic.get());

  assert.throws(() => cyclic.get(), /Reactive computed cycle detected/);
  assert.throws(() => cyclic.get(), /Reactive computed cycle detected/);
});

test('derive errors restore tracking state and allow a later retry', () => {
  const shouldThrow = createSignal(true);
  const source = createSignal(1);
  const derived = computed(() => {
    const fail = shouldThrow.get();
    const value = source.get();
    if (fail) {
      throw new Error('derive failed');
    }
    return value;
  });

  assert.throws(() => derived.get(), /derive failed/);
  shouldThrow.set(false);
  assert.equal(derived.get(), 1);
  source.set(2);
  assert.equal(derived.get(), 2);
});

test('effect body errors restore the stack and allow later signal work', () => {
  const source = createSignal(0);
  let fail = false;
  const values = [];
  const dispose = effect(() => {
    const value = source.get();
    if (fail) {
      fail = false;
      throw new Error('effect failed');
    }
    values.push(value);
  });

  fail = true;
  assert.throws(() => source.set(1), /effect failed/);
  source.set(2);
  dispose();

  assert.deepEqual(values, [0, 2]);
});

test('cleanup errors during rerun preserve dependencies for a later retry', () => {
  const source = createSignal(0);
  let cleanupShouldThrow = true;
  const values = [];
  const dispose = effect(() => {
    values.push(source.get());
    return () => {
      if (cleanupShouldThrow) {
        cleanupShouldThrow = false;
        throw new Error('rerun cleanup failed');
      }
    };
  });

  assert.throws(() => source.set(1), /rerun cleanup failed/);
  source.set(2);
  dispose();

  assert.deepEqual(values, [0, 2]);
});

test('dispose detaches dependencies before rethrowing cleanup errors', () => {
  const source = createSignal(0);
  let runs = 0;
  const dispose = effect(() => {
    source.get();
    runs += 1;
    return () => {
      throw new Error('cleanup failed');
    };
  });

  assert.throws(dispose, /cleanup failed/);
  source.set(1);
  assert.equal(runs, 1);
});

test('listener errors clear the current queue without rolling back writes', () => {
  const first = createSignal(0);
  const second = createSignal(0);
  const events = [];
  first.subscribe(() => {
    throw new Error('listener failed');
  });
  second.subscribe((value) => {
    events.push(value);
  });

  assert.throws(() => {
    batch(() => {
      first.set(1);
      second.set(1);
    });
  }, /listener failed/);

  assert.equal(first.get(), 1);
  assert.equal(second.get(), 1);
  assert.deepEqual(events, []);
  second.set(2);
  assert.deepEqual(events, [2]);
});

test('recursive listener updates stop at the transaction job limit', () => {
  const source = createSignal(0);
  const unsubscribe = source.subscribe((value) => {
    source.set(value + 1);
  });

  assert.throws(
    () => source.set(1),
    /Reactive update cycle exceeded 1000 jobs/
  );
  unsubscribe();
});

test('reactive owners dispose children and cleanups in reverse creation order', () => {
  const events = [];
  const parent = createReactiveOwner();

  runWithOwner(parent, () => {
    effect(() => () => events.push('parent:first'));
    const child = createReactiveOwner();
    runWithOwner(child, () => {
      effect(() => () => events.push('child'));
    });
    effect(() => () => events.push('parent:last'));
  });

  disposeReactiveOwner(parent);
  disposeReactiveOwner(parent);

  assert.deepEqual(events, ['child', 'parent:last', 'parent:first']);
});

test('owner disposal continues after cleanup errors and aggregates them', () => {
  const owner = createReactiveOwner();
  const events = [];
  runWithOwner(owner, () => {
    effect(() => () => {
      events.push('first');
      throw new Error('first failed');
    });
    effect(() => () => {
      events.push('second');
      throw new Error('second failed');
    });
  });

  assert.throws(
    () => disposeReactiveOwner(owner),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      return true;
    }
  );
  assert.deepEqual(events, ['second', 'first']);
});

test('runWithOwner restores the owner stack after errors', () => {
  const owner = createReactiveOwner();
  assert.throws(
    () => runWithOwner(owner, () => {
      assert.equal(getCurrentOwner(), owner);
      throw new Error('owner body failed');
    }),
    /owner body failed/
  );
  assert.equal(getCurrentOwner(), undefined);
  disposeReactiveOwner(owner);
  assert.throws(
    () => runWithOwner(owner, () => {}),
    /disposed reactive owner/
  );
});

test('owned computed and effect release their source dependencies', () => {
  const source = createSignal(0);
  const owner = createReactiveOwner();
  let derivedRuns = 0;
  let effectRuns = 0;
  let derived;

  runWithOwner(owner, () => {
    derived = computed(() => {
      derivedRuns += 1;
      return source.get() * 2;
    });
    effect(() => {
      effectRuns += 1;
      derived.get();
    });
  });

  assert.equal(derivedRuns, 1);
  assert.equal(effectRuns, 1);
  source.set(1);
  assert.equal(derivedRuns, 2);
  assert.equal(effectRuns, 2);

  disposeReactiveOwner(owner);
  source.set(2);
  assert.equal(derivedRuns, 2);
  assert.equal(effectRuns, 2);
  assert.throws(() => derived.get(), /computation has been disposed/);
});

test('subscriptions created inside an owner are disposed automatically', () => {
  const source = createSignal(0);
  const derived = computed(() => source.get() * 2);
  const owner = createReactiveOwner();
  const sourceValues = [];
  const derivedValues = [];

  runWithOwner(owner, () => {
    source.subscribe((value) => sourceValues.push(value));
    derived.subscribe((value) => derivedValues.push(value));
  });

  source.set(1);
  assert.deepEqual(sourceValues, [1]);
  assert.deepEqual(derivedValues, [2]);

  disposeReactiveOwner(owner);
  source.set(2);
  assert.deepEqual(sourceValues, [1]);
  assert.deepEqual(derivedValues, [2]);
});
