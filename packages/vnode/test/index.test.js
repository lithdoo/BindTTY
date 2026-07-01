import assert from 'node:assert/strict';
import test from 'node:test';

import {
  elementTemplate,
  forTemplate,
  fragmentTemplate,
  isReadableSignal,
  normalizeChildren,
  normalizeSingleTemplate,
  resolveBindingValue,
  showTemplate
} from '../dist/index.js';

function signal(value) {
  return {
    get() {
      return value;
    },
    subscribe() {
      return () => {};
    }
  };
}

test('creates element templates and validates element schema', () => {
  const title = signal('Hello');
  const view = elementTemplate('text', { value: title, color: 'green' });

  assert.deepEqual(view, {
    kind: 'element',
    tag: 'text',
    props: {
      value: title,
      color: 'green'
    },
    children: []
  });

  assert.throws(
    () => elementTemplate('text', { value: 'Hello' }, [
      elementTemplate('spacer')
    ]),
    /does not accept children/
  );

  assert.throws(() => elementTemplate('text'), /requires prop "value"/);
});

test('element schema includes common interaction props', () => {
  const onKey = () => true;
  const onFocusChange = () => {};
  const view = elementTemplate('box', {
    id: 'panel',
    onKey,
    onFocusChange
  });

  assert.deepEqual(view, {
    kind: 'element',
    tag: 'box',
    props: {
      id: 'panel',
      onKey,
      onFocusChange
    },
    children: []
  });
});

test('normalizes empty, array, and fragment children', () => {
  const first = elementTemplate('text', { value: 'A' });
  const second = elementTemplate('text', { value: 'B' });
  const children = normalizeChildren([null, first, [false, second]]);

  assert.deepEqual(children, [first, second]);
  assert.deepEqual(normalizeSingleTemplate(null), { kind: 'empty' });
  assert.deepEqual(normalizeSingleTemplate([first, second]), {
    kind: 'fragment',
    children: [first, second]
  });

  assert.throws(() => normalizeChildren('plain text'), /Template children/);
});

test('creates fragment, show, and for templates', () => {
  const loading = signal(true);
  const items = signal([{ id: 1, title: 'One' }]);
  const body = elementTemplate('text', { value: 'Loading...' });
  const fallback = elementTemplate('text', { value: 'Ready' });

  assert.deepEqual(fragmentTemplate([body]), {
    kind: 'fragment',
    children: [body]
  });

  assert.deepEqual(showTemplate({ when: loading, children: body, fallback }), {
    kind: 'show',
    when: loading,
    children: body,
    fallback
  });

  const each = forTemplate({
    each: items,
    key: (item) => item.id,
    renderItem: (item) => elementTemplate('text', { value: item.title })
  });

  assert.equal(each.kind, 'for');
  assert.equal(each.each, items);
  assert.equal(each.key(items.get()[0], 0), 1);
  assert.deepEqual(each.renderItem(items.get()[0], 0), {
    kind: 'element',
    tag: 'text',
    props: {
      value: 'One'
    },
    children: []
  });
});

test('treats readable signals as binding values', () => {
  const name = signal('BindTTY');

  assert.equal(isReadableSignal(name), true);
  assert.equal(resolveBindingValue(name), 'BindTTY');
  assert.equal(resolveBindingValue('static'), 'static');
});
