# BindTTY 文档

项目主文档：[../README.md](../README.md)。维护规范：[CONVENTIONS.md](./CONVENTIONS.md)。

## 读者路径

| 目标 | 入口 |
| --- | --- |
| 理解架构 | [architecture/DESIGN.md](./architecture/DESIGN.md) |
| 改某个包 | [packages/](#packages) 下对应文档 |
| 宽字符 / display width | [specs/DISPLAY_WIDTH.md](./specs/DISPLAY_WIDTH.md) |
| 滚动 / ScrollView / VScrollView / HScrollView / List | [specs/SCROLL_VIEWPORT.md](./specs/SCROLL_VIEWPORT.md) |
| Text + Yoga layout | [specs/YOGA_AND_TEXT.md](./specs/YOGA_AND_TEXT.md) |
| Layout prop 支持矩阵 | [specs/LAYOUT_PROPS.md](./specs/LAYOUT_PROPS.md) |
| Element Ref | [specs/ELEMENT_REF.md](./specs/ELEMENT_REF.md) |
| TextInput | [specs/TEXT_INPUT.md](./specs/TEXT_INPUT.md) |
| E2E 测试 | [testing/E2E.md](./testing/E2E.md) |
| 里程碑 / 路线图 | [architecture/ROADMAP.md](./architecture/ROADMAP.md) |
| Alpha hardening 规划 | [architecture/NEXT_STEPS.md](./architecture/NEXT_STEPS.md) |
| 历史计划 | [archive/plans/](./archive/plans/) |

## architecture/

| 文档 | 内容 |
| --- | --- |
| [DESIGN.md](./architecture/DESIGN.md) | 视图树总体设计、四层结构、BindingValue |
| [ROADMAP.md](./architecture/ROADMAP.md) | M1–M7 里程碑与下一阶段 |
| [NEXT_STEPS.md](./architecture/NEXT_STEPS.md) | Alpha hardening 阶段规划与 Issue 对照 |

## packages/

| 文档 | 包 |
| --- | --- |
| [VNODE.md](./packages/VNODE.md) | @bindtty/vnode |
| [JSX_RUNTIME.md](./packages/JSX_RUNTIME.md) | @bindtty/jsx-runtime |
| [RUNTIME.md](./packages/RUNTIME.md) | @bindtty/runtime |
| [LAYOUT.md](./packages/LAYOUT.md) | @bindtty/layout |
| [RENDERER.md](./packages/RENDERER.md) | @bindtty/renderer-terminal |
| [TERMINAL.md](./packages/TERMINAL.md) | @bindtty/terminal |
| [INTERACTION.md](./packages/INTERACTION.md) | @bindtty/interaction |
| [WIDGETS.md](./packages/WIDGETS.md) | @bindtty/widgets |
| [APP.md](./packages/APP.md) | bindtty createApp |

## specs/

| 文档 | 内容 |
| --- | --- |
| [DISPLAY_WIDTH.md](./specs/DISPLAY_WIDTH.md) | Terminal display-width / grapheme |
| [SCROLL_VIEWPORT.md](./specs/SCROLL_VIEWPORT.md) | Clip / scroll / ScrollView / VScrollView / HScrollView / List |
| [YOGA_AND_TEXT.md](./specs/YOGA_AND_TEXT.md) | @bindtty/text + Yoga 默认 engine |
| [LAYOUT_PROPS.md](./specs/LAYOUT_PROPS.md) | intrinsic layout prop 支持矩阵 |
| [ELEMENT_REF.md](./specs/ELEMENT_REF.md) | `ref(api)` / MountedElementApi |
| [TEXT_INPUT.md](./specs/TEXT_INPUT.md) | TextInput 控件 |

## testing/

| 文档 | 内容 |
| --- | --- |
| [E2E.md](./testing/E2E.md) | mock + real PTY E2E |
| [../.github/workflows/ci.yml](../.github/workflows/ci.yml) | GitHub Actions CI（build / test / examples） |
| [../packages/e2e/README.md](../packages/e2e/README.md) | E2E 包说明 |

## 其它

| 文档 | 内容 |
| --- | --- |
| [../TODO.md](../TODO.md) | 开放改进项（可执行 checklist） |
| [archive/](./archive/) | 历史备份与 [archive/plans/](./archive/plans/) |
| [redirects/](./redirects/) | 旧文件名 stub |

`@bindtty/signal` 见 [architecture/DESIGN.md](./architecture/DESIGN.md) §20 与 [packages/signal/README.md](../packages/signal/README.md)。
