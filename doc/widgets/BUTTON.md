# Button 规范（Button）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/widgets/src/form/button.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · [INTERACTION.md](../packages/INTERACTION.md)

---

## 1. 范围

### 1.1 已支持

- `label` / `id` / `disabled` binding
- Enter / Space → `onPress`
- disabled → `focusable=false`、`onKey=false`、dim 样式
- renderer 默认 focused inverse 样式


## 2. 对外 API

```ts
export interface ButtonProps extends ButtonStyleProps {
  id?: BindingValue<string | number>;
  label?: BindingValue<string | number>;
  disabled?: BindingValue<boolean>;
  onPress?: () => void;
  onFocusChange?: (event: InteractionNodeFocusChangeEvent) => void;
}

export interface ButtonStyleProps {
  color?: BindingValue<string>;
  background?: BindingValue<string>;
  borderColor?: BindingValue<string>;
  bold?: BindingValue<boolean>;
  dim?: BindingValue<boolean>;
  padding?: BindingValue<number>;
  border?: BindingValue<boolean | number>;
}
```

TSX：

```tsx
<Button label="Save" onPress={save} />
<Button id="submit" label={vm.submitLabel} disabled={vm.saving} onPress={submit} />
```

---

## 3. 渲染与按键

```text
Button
  -> box border padding onKey
       -> text value=label
```

| 键 | 行为 |
| --- | --- |
| Enter / Space | `onPress()`，`handled=true` |
| 其它 | `handled=false` |

```text
disabled=true:
  focusable=false
  onKey=false
  dim=true 或 color="gray"
  不触发 onPress

disabled=false:
  focusable 默认 true
  onKey=handler
```

---

## 4. 测试回归索引

| 层 | 位置 |
| --- | --- |
| unit | `packages/widgets/test/widgets.test.ts` |
| bindtty | `packages/bindtty/test/app.test.ts` |
| mock E2E | `packages/e2e/mock/test/app-terminal.test.tsx` |
