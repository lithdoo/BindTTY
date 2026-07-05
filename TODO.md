# BindTTY 开放改进项

> 阶段规划见 [doc/architecture/NEXT_STEPS.md](doc/architecture/NEXT_STEPS.md)

## 已完成（近期）

- [x] Focus 与 Key Event 传播（`focusable` / `onKeyCapture` / capture-target-bubble）— 见 [doc/architecture/FOCUS_AND_KEY_EVENT_PLAN.md](doc/architecture/FOCUS_AND_KEY_EVENT_PLAN.md)

## 暂缓

- Modal / Overlay（需 overlay layer、z-index、focus trap）
- List / ScrollView virtualization（先 benchmark）
- `flexDirection` 与剩余 Yoga props（见 [doc/specs/LAYOUT_PROPS.md](doc/specs/LAYOUT_PROPS.md)）

## 开放

- real PTY 专项 CI job（Windows / WSL）
- 组件生态：Tabs 等（见 NEXT_STEPS Phase C）
