# Select 规范（Select）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/form/select.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · [SCROLL.md](./SCROLL.md)

---

## 1. 范围

### 1.1 已支持

- Inline 单选列表；`>` 标记当前项
- Up/Down 即时 `onChange`
- 可选 `height` 启用 clip + `scrollY` 滚动

### 1.2 不在范围

- 下拉折叠 / 弹出层
- 多选
- 搜索过滤

---

## 2. 对外 API

```ts
export interface SelectOption<T = string> {
  value: T;
  label: BindingValue<string | number>;
}

export interface SelectProps<T = string> extends SelectStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  options: BindingValue<readonly SelectOption<T>[]>;
  value: BindingValue<T>;
  disabled?: BindingValue<boolean>;
  height?: BindingValue<number>;
  onChange?: (nextValue: T) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

TSX：

```tsx
const lang = createSignal("ts");

<Select
  label="Language"
  height={5}
  options={[
    { value: "ts", label: "TypeScript" },
    { value: "js", label: "JavaScript" },
  ]}
  value={lang}
  onChange={(next) => lang.set(next)}
/>
```

---

## 3. 渲染与按键

```text
box (onKey, border=false)
  vstack
    text label
    box (overflow=clip, scrollY, height?)
      for options -> text "> Label" | "  Label"
```

按键：Up/Down 上一项/下一项；Home/End 首/末项；Enter/Space 不处理；disabled → `onKey=false` + dim。

---

## 4. 测试回归索引

| 层 | 位置 |
| --- | --- |
| unit | `packages/widgets/test/select.test.ts` |
| mock E2E | `packages/e2e/mock/test/app-terminal.test.tsx` |
