# Checkbox 规范（Checkbox）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/form/checkbox.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · [INTERACTION.md](../packages/INTERACTION.md)

---

## 1. 范围

### 1.1 已支持

- 受控 `checked` + `onChange`
- marker / label 分离渲染
- Space / Enter → toggle
- disabled → `onKey=false` + label dim

### 1.2 不在范围

- 三态 indeterminate
- 鼠标点击

---

## 2. 对外 API

```ts
export interface CheckboxProps extends CheckboxStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  checked: BindingValue<boolean>;
  disabled?: BindingValue<boolean>;
  onChange?: (nextChecked: boolean) => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}
```

TSX：

```tsx
const agree = createSignal(false);

<Checkbox
  label="Subscribe"
  checked={agree}
  onChange={(next) => agree.set(next)}
/>
```

---

## 3. 渲染与按键

```text
box (onKey, border=false)
  hstack gap=1
    text "[ ]" | "[x]"
    text label
```

按键：Space / Enter → `onChange(!checked)`；disabled → `onKey=false` + label dim。

---

## 4. 测试回归索引

| 层 | 位置 |
| --- | --- |
| unit | `packages/widgets/test/checkbox.test.ts` |
| mock E2E | `packages/e2e/mock/test/app-terminal.test.tsx` |
