import assert from 'node:assert/strict';
import test from 'node:test';

import { computed, createSignal, effect } from '../dist/index.js';

test('signal stores values and notifies subscribers', () => {
  // 基础 signal 应该同时支持读取、直接写入、基于旧值更新，以及显式订阅。
  const count = createSignal(0);
  const changes = [];

  const unsubscribe = count.subscribe((value, previousValue) => {
    changes.push([value, previousValue]);
  });

  count.set(1);
  count.update((value) => value + 1);
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
