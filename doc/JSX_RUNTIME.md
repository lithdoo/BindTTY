# @bindtty/jsx-runtime 落地设计

本文档描述 `@bindtty/jsx-runtime` 的 MVP 实现方案。它承接 `@bindtty/vnode` 已实现的数据模型，把 TypeScript/TSX 编译产物转换为 BindTTY 的 `ViewTemplate`。

相关文档：

- [VNODE.md](./VNODE.md) — Template / BindingValue / MountedNode 类型设计
- [DESIGN.md](./DESIGN.md) — 视图树总体设计
- [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) — 实现计划与里程碑

## 1. 目标

`@bindtty/jsx-runtime` 的目标是让用户可以写 TSX：

```tsx
<vstack>
  <text value="Hello" />
  <text value={vm.title} />
</vstack>
```

并生成 `@bindtty/vnode` 的 `ViewTemplate`：

```text
ElementTemplate(tag: "vstack")
  ElementTemplate(tag: "text", props.value = "Hello")
  ElementTemplate(tag: "text", props.value = vm.title)
```

它不负责：

```text
1. signal 求值
2. signal subscription
3. component 执行
4. mount
5. dirty
6. layout / paint
7. terminal output
```

这些能力分别属于 `@bindtty/runtime`、`@bindtty/layout` 和 `@bindtty/widgets`。

## 2. 包位置

路径：

```text
packages/jsx-runtime
```

建议模块：

```text
packages/jsx-runtime/
  src/
    index.ts
    jsx-runtime.ts
    jsx-dev-runtime.ts
    types.ts
  test/
    jsx-runtime.test.js
  package.json
  tsconfig.json
```

## 3. TypeScript 配置

当前用户侧推荐直接引用 JSX runtime 子包：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@bindtty/jsx-runtime"
  }
}
```

顶层 `bindtty` 包当前只导出用户运行时入口，不转发 JSX runtime 子路径。因此暂不支持：

```text
jsxImportSource: "bindtty"
```

如果未来希望用户只配置 `jsxImportSource: "bindtty"`，需要在 `packages/bindtty/package.json` 中额外导出 `./jsx-runtime` 与 `./jsx-dev-runtime` 子路径。

## 4. 必要导出

自动 JSX runtime 至少需要导出：

```ts
export function jsx(type, props, key) {}
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = Symbol.for("bindtty.fragment");
```

建议文件边界：

```text
src/jsx-runtime.ts      导出 jsx / jsxs / Fragment
src/jsx-dev-runtime.ts  导出 jsxDEV / Fragment
src/index.ts            导出公共类型或 helper
```

`jsxDEV` 第一版可以忽略 dev-only 参数，只复用 `jsx` 逻辑。

## 5. 输入形态

TypeScript automatic runtime 会把：

```tsx
<box border>
  <text value="Hello" />
</box>
```

编译成近似：

```ts
jsxs("box", {
  border: true,
  children: jsx("text", { value: "Hello" })
});
```

因此 runtime 需要处理：

```text
type: string | FunctionComponent | Fragment
props: object | null
props.children: unknown
key: unknown | undefined
```

MVP 阶段不把 `key` 放入普通 `ElementTemplate` 或 component props。

需要特别注意：在 TypeScript automatic runtime 中，TSX 的 `key` 是特殊属性，不会出现在 `props` 中，而是作为 `jsx(type, props, key)` 的第三个参数传入。因此：

```tsx
<for each={items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
```

运行时收到的是近似：

```ts
jsx("for", {
  each: items,
  children: (item) => jsx("text", { value: item.title })
}, (item) => item.id);
```

`@bindtty/jsx-runtime` 需要只在 `type === "for"` 时把第三参数恢复为 `ForTemplate.key`；普通元素和组件仍忽略 `key`。

## 6. 转换规则

### 6.1 intrinsic element

```tsx
<text value="Hello" />
```

转换为：

```ts
elementTemplate("text", { value: "Hello" }, [])
```

规则：

```text
1. type 是 string。
2. type 必须是 IntrinsicElementTag。
3. props.children 从 props 中剥离。
4. 剩余 props 原样作为 TemplateProps 保存。
5. children 交给 vnode.normalizeChildren。
6. element schema 由 vnode.elementTemplate 校验。
```

### 6.2 Fragment

```tsx
<>
  <text value="A" />
  <text value="B" />
</>
```

转换为：

```ts
fragmentTemplate(children)
```

Fragment 不保存 props，也不对应终端元素。

### 6.3 function component

```tsx
<Header title={vm.title} />
```

转换为：

```ts
componentTemplate(Header, { title: vm.title })
```

注意：JSX runtime 不执行组件函数。组件只在 mount 阶段由 `@bindtty/runtime` 展开。

### 6.4 show

用户写法：

```tsx
<show when={vm.loading} fallback={<text value="Ready" />}>
  <text value="Loading..." />
</show>
```

转换为：

```ts
showTemplate({
  when: vm.loading,
  fallback: elementTemplate("text", { value: "Ready" }),
  children: elementTemplate("text", { value: "Loading..." })
})
```

规则：

```text
1. show 是 control node，不是 intrinsic element。
2. show 必须有 when prop。
3. fallback 可选。
4. children 会被 normalizeSingleTemplate 归一化。
5. 多个 children 会变成 FragmentTemplate。
```

### 6.5 for

用户写法：

```tsx
<for each={vm.items} key={(item) => item.id}>
  {(item) => <text value={item.title} />}
</for>
```

转换为：

```ts
forTemplate({
  each: vm.items,
  key: (item) => item.id,
  renderItem: (item, index) => elementTemplate("text", { value: item.title })
})
```

规则：

```text
1. for 是 control node，不是 intrinsic element。
2. for 必须有 each prop。
3. children 必须是函数。
4. 函数返回值必须是 Template。
5. key prop 可选，但列表 UI 推荐提供。
```

## 7. children 规则

`@bindtty/vnode` 已经定义了 children 归一化规则。JSX runtime 只负责把 `props.children` 传过去。

允许：

```tsx
<box>
  <text value="Hello" />
  {condition ? <text value="A" /> : null}
  {[<text value="B" />, <text value="C" />]}
</box>
```

不允许：

```tsx
<box>
  Hello
</box>
```

MVP 阶段这会在 normalize 时抛错。用户应该写：

```tsx
<box>
  <text value="Hello" />
</box>
```

`text` 自身也不接受 children：

```tsx
<text>Hello</text>
```

未来如果要支持它，也只能作为语法糖转换为：

```tsx
<text value="Hello" />
```

## 8. BindingValue 规则

JSX runtime 不读取 binding。

```tsx
<text value={vm.title} />
```

其中 `vm.title` 会原样进入 Template props：

```ts
props: {
  value: vm.title
}
```

`BindingValue<T>` 只有两种形态：

```ts
type BindingValue<T> = T | ReadableSignal<T>;
```

View 层 `bind(() => ...)` 如果存在，也应返回 `ReadableSignal<T>`。JSX runtime 不需要识别第三种 `BindingExpression`。

## 9. JSX 类型约束

**注意：** 以下类型定义为文档简化版。实际代码中所有 intrinsic element 都会通过共享的 `IntrinsicInteractionProps` 获得 `id`、`onKey`、`onFocusChange` 三个交互 prop，且 `box`/`text` 等元素通过 `IntrinsicPaintProps` 额外获得 `color`、`background`、`bold`、`focusStyle` 等 paint prop。详情见各包源码。

`@bindtty/jsx-runtime` 应提供 JSX namespace 类型，让常见错误尽量在编译期暴露。

示例：

```ts
declare namespace JSX {
  type Element = Template;

  interface IntrinsicElements {
    screen: {
      children?: TemplateChildren;
    };

    box: {
      children?: TemplateChildren;
      border?: BindingValue<boolean>;
      padding?: BindingValue<number>;
    };

    vstack: {
      children?: TemplateChildren;
    };

    hstack: {
      children?: TemplateChildren;
    };

    text: {
      value: BindingValue<string | number>;
      color?: BindingValue<string>;
      bold?: BindingValue<boolean>;
      children?: never;
    };

    button: {
      value: BindingValue<string | number>;
      disabled?: BindingValue<boolean>;
      onPress?: () => void;
      children?: never;
    };

    input: {
      value?: BindingValue<string>;
      placeholder?: BindingValue<string>;
      children?: never;
    };

    spacer: {
      size?: BindingValue<number>;
      children?: never;
    };

    show: {
      when: BindingValue<boolean>;
      fallback?: Template;
      children?: TemplateChildren;
    };

    for: {
      each: BindingValue<readonly unknown[]>;
      key?: (item: unknown, index: number) => string | number;
      children: (item: unknown, index: number) => Template;
    };
  }
}
```

后续可以通过泛型 helper 改善 `for` 的 item 类型推断，但 MVP 可以先接受 `unknown`。

## 10. 实现伪代码

```ts
import {
  componentTemplate,
  elementTemplate,
  forTemplate,
  fragmentTemplate,
  showTemplate
} from "@bindtty/vnode";

export const Fragment = Symbol.for("bindtty.fragment");

export function jsx(type: unknown, rawProps: unknown, key?: unknown) {
  const props = normalizeProps(rawProps);
  const children = props.children;
  delete props.children;

  if (type === Fragment) {
    return fragmentTemplate(children);
  }

  if (typeof type === "function") {
    return componentTemplate(type, props);
  }

  if (type === "show") {
    return showTemplate({
      when: props.when,
      fallback: props.fallback,
      children
    });
  }

  if (type === "for") {
    if (key !== undefined && !("key" in props)) {
      props.key = key;
    }

    if (typeof children !== "function") {
      throw new TypeError("<for> children must be a render function.");
    }

    return forTemplate({
      each: props.each,
      key: props.key,
      renderItem: children
    });
  }

  if (typeof type === "string") {
    return elementTemplate(type, props, children);
  }

  throw new TypeError("Unsupported JSX type.");
}

export const jsxs = jsx;
```

实现时需要把 `type` 收窄到 `IntrinsicElementTag`，未知字符串应抛错。

## 11. 包导出建议

`@bindtty/jsx-runtime/package.json`：

```json
{
  "name": "@bindtty/jsx-runtime",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./jsx-runtime": {
      "types": "./dist/jsx-runtime.d.ts",
      "import": "./dist/jsx-runtime.js"
    },
    "./jsx-dev-runtime": {
      "types": "./dist/jsx-dev-runtime.d.ts",
      "import": "./dist/jsx-dev-runtime.js"
    }
  }
}
```

`bindtty` 入口包后续也需要提供同名子路径：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./jsx-runtime": {
      "types": "./dist/jsx-runtime.d.ts",
      "import": "./dist/jsx-runtime.js"
    },
    "./jsx-dev-runtime": {
      "types": "./dist/jsx-dev-runtime.d.ts",
      "import": "./dist/jsx-dev-runtime.js"
    }
  }
}
```

## 12. 测试计划

MVP 测试应覆盖：

```text
1. intrinsic element:
   <text value="Hello" />

2. container children:
   <box><text value="Hello" /></box>

3. fragment:
   <><text value="A" /><text value="B" /></>

4. function component:
   <Header title={vm.title} />

5. show:
   <show when={vm.loading} fallback={<text value="Ready" />}>...</show>

6. for:
   <for each={vm.items} key={(item) => item.id}>{...}</for>

7. invalid text child:
   <box>Hello</box>

8. invalid leaf children:
   <text value="Hello"><spacer /></text>

9. BindingValue preservation:
   signal prop should be the same object reference in Template props.
```

建议测试方式：

```text
1. 用 TypeScript 编译一个 .tsx fixture。
2. 在 node:test 中 import 编译后的 fixture。
3. 断言输出 Template shape。
```

也可以先直接调用 `jsx/jsxs` 做单元测试，再补 TSX fixture 测试。

## 13. MVP 验收标准

第一版 `@bindtty/jsx-runtime` 完成后，应满足：

```text
1. `npm run build` 通过。
2. node:test 覆盖 jsx/jsxs/Fragment/control node。
3. TSX 可以生成 vnode Template。
4. signal / computed 不被读取，只作为 props 引用保存。
5. function component 不被执行，只生成 ComponentTemplate。
6. string / number children 仍被拒绝。
7. `BindingValue` 口径保持 T | ReadableSignal<T>。
```

到这里，主链路前半段就成立：

```text
TSX
  ↓
@bindtty/jsx-runtime
  ↓
ViewTemplate
```

下一步再进入 `@bindtty/runtime` 的 `Template -> MountedNode`。

## M7 当前实现：box TSX props

`box` 的 TSX 类型已支持 M7 layout props：

```tsx
<box height={3} width={20} overflow="clip" scrollY={offset}>
  <text value="row" />
</box>
```

用户优先使用 `@bindtty/widgets` 的 `ScrollView` / `List`；这些组件内部仍生成普通 `box` Template。
