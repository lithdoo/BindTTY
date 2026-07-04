# BindTTY 文档

项目主文档已移至 [../README.md](../README.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [VNODE.md](./VNODE.md) | @bindtty/vnode 包设计（Template + MountedNode） |
| [JSX_RUNTIME.md](./JSX_RUNTIME.md) | @bindtty/jsx-runtime 落地设计（TSX → ViewTemplate） |
| [RUNTIME.md](./RUNTIME.md) | @bindtty/runtime 落地设计（Template → MountedNode） |
| [LAYOUT.md](./LAYOUT.md) | @bindtty/layout 落地设计（MountedNode → LayoutNode） |
| [RENDERER.md](./RENDERER.md) | @bindtty/renderer-terminal 落地设计（LayoutNode → Frame → ANSI Patch） |
| [APP.md](./APP.md) | bindtty createApp 落地设计（runtime + layout + renderer + terminal + interaction） |
| [TERMINAL.md](./TERMINAL.md) | @bindtty/terminal 落地设计（terminal lifecycle + input + resize） |
| [INTERACTION.md](./INTERACTION.md) | @bindtty/interaction 落地设计（keyboard focus + onKey dispatch） |
| [NODE_SETUP.md](./NODE_SETUP.md) | 节点级 onSetup 设计（实例访问、layout/focus/lifecycle 扩展入口） |
| [WIDGETS.md](./WIDGETS.md) | @bindtty/widgets 落地设计（Button / TextInput 等高层控件） |
| [TEXT_INPUT.md](./TEXT_INPUT.md) | TextInput 控件详细设计（拆分光标渲染方案） |
| [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md) | Terminal display-width / 宽字符 / grapheme 支持（text → renderer） |
| [E2E_TESTING.md](./E2E_TESTING.md) | E2E 测试计划（mock + real PTY） |
| [../packages/e2e/README.md](../packages/e2e/README.md) | E2E 包说明（`mock/` 与 `real/`） |
| [DESIGN.md](./DESIGN.md) | 视图树总体设计、四层结构、BindingValue、control node |
| [TUI_IMPLEMENTATION_PLAN.md](./TUI_IMPLEMENTATION_PLAN.md) | 实现计划、里程碑、优先级 |
| [M7_SCROLL_VIEWPORT.md](./M7_SCROLL_VIEWPORT.md) | **M7** scroll / viewport / list 计划与设计 |
| [archive/](./archive/) | 已合并前的原始分拆文档备份 |
