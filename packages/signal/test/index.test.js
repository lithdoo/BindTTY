import assert from 'node:assert/strict';
import test from 'node:test';

import { computed, createSignal, effect } from '../dist/index.js';

test('signal stores values and notifies subscribers', () => {
  const count = createSignal(0);
  const changes = [];

  const unsubscribe = count.subscribe((value, previousValue) => {
    changes.push([value, previousValue]);
  });

  count.set(1);
  count.update((value) => value + 1);
  count.set(2);
  unsubscribe();
  count.set(3);

  assert.equal(count.get(), 3);
  assert.deepEqual(changes, [
    [1, 0],
    [2, 1]
  ]);
});

test('computed tracks dependencies and updates derived values', () => {
  const count = createSignal(2);
  const doubled = computed(() => count.get() * 2);
  const plusOne = computed(() => doubled.get() + 1);

  assert.equal(plusOne.get(), 5);

  count.set(4);

  assert.equal(doubled.get(), 8);
  assert.equal(plusOne.get(), 9);
});

test('effect runs immediately, reacts to changes, and disposes', () => {
  const count = createSignal(0);
  const values = [];

  const dispose = effect(() => {
    values.push(count.get());
  });

  count.set(1);
  count.set(2);
  dispose();
  count.set(3);

  assert.deepEqual(values, [0, 1, 2]);
});

test('dependencies are collected dynamically on every run', () => {
  const useA = createSignal(true);
  const a = createSignal('a0');
  const b = createSignal('b0');
  const selected = computed(() => (useA.get() ? a.get() : b.get()));

  assert.equal(selected.get(), 'a0');

  b.set('b1');
  assert.equal(selected.get(), 'a0');

  useA.set(false);
  assert.equal(selected.get(), 'b1');

  a.set('a1');
  assert.equal(selected.get(), 'b1');

  b.set('b2');
  assert.equal(selected.get(), 'b2');
});

test('effect cleanup runs before rerun and on dispose', () => {
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
  dispose();

  assert.deepEqual(events, ['run:0', 'cleanup:0', 'run:1', 'cleanup:1']);
});
