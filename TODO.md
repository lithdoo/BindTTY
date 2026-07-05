# BindTTY 开放改进项

可执行的开放任务清单。完整 alpha hardening 规划见 [doc/architecture/NEXT_STEPS.md](doc/architecture/NEXT_STEPS.md)；里程碑见 [doc/architecture/ROADMAP.md](doc/architecture/ROADMAP.md)。

---

## 已完成（2026-07）

- M1–M7 主链路（TSX → mount → layout → paint → ANSI diff → terminal → interaction → widgets）
- TextInput grapheme-aware 编辑与 **display-column 输入窗口**（`overflow: "clip"` + `scrollX`；见 [doc/widgets/TEXT_INPUT.md](doc/widgets/TEXT_INPUT.md) §1.1）
- display-width / 宽字符全链路（见 [doc/specs/DISPLAY_WIDTH.md](doc/specs/DISPLAY_WIDTH.md)）
- npm 发布工程配置：`0.1.0-alpha.2`、LICENSE、`scripts/publish-packages.mjs`（commit `8b03b27`）
- `bindtty` JSX runtime 转发（`jsxImportSource: "bindtty"`）
- ROADMAP 历史 7 包 / 10 包模型移入 [doc/archive/plans/PACKAGE_MODEL_HISTORY.md](doc/archive/plans/PACKAGE_MODEL_HISTORY.md)
- `bindtty` 顶层公共 API 冻结：`createApp`、`createSignal` / `computed` / `effect`、JSX 转发（widgets 见 `@bindtty/widgets`）
- GitHub Actions CI（`.github/workflows/ci.yml`：`npm ci` / `build` / `test` / `build:examples`）
- npm 首版公开发布：`0.1.0-alpha.2`（11 包，tag `alpha`）
- `VScrollView` / `HScrollView` / 双轴 `ScrollView` 滚动组件模型
- `bindtty` 与 `@bindtty/widgets` 分包：`bindtty` 不 re-export widgets

---

## P1 — 体验与 layout

- [x] Layout prop matrix：`minWidth` / `minHeight` / `maxWidth` / `maxHeight`
- [x] Layout prop matrix：edge `padding*`、`margin*`
- [x] VScrollView `stickToBottom`（log viewer / chat；原 `ScrollView`）
- [x] `VScrollView` / `HScrollView` / 双轴 `ScrollView`
- [x] Layout 支持矩阵文档与 `layout-props.ts` 对齐（[doc/specs/LAYOUT_PROPS.md](doc/specs/LAYOUT_PROPS.md)）

---

## P2 — 组件生态

- [x] `Checkbox` widget
- [x] `Select` widget（单选）
- [x] `ProgressBar` widget（见 [doc/widgets/PROGRESS_BAR.md](doc/widgets/PROGRESS_BAR.md)）
- [x] VScrollView / HScrollView scrollbar（视觉指示，非鼠标交互）
- [x] ScrollView 双轴滚动（X+Y；见 [doc/specs/SCROLL_VIEWPORT.md](doc/specs/SCROLL_VIEWPORT.md) §5.6）

---

## 暂缓（需先更新 spec，勿直接改代码）

以下项在各 spec 中已标明为非目标或单独批次，**不要**在无 spec 变更时直接实现：

- RichText / TextSpan（text value 内嵌 ANSI）
- Frame `width > 2` / placeholder 链扩展
- IME / 多行 / 文本选区 / 鼠标定位（见 [doc/widgets/TEXT_INPUT.md](doc/widgets/TEXT_INPUT.md) 非目标）
- Scroll/List 虚拟化（先 benchmark 再决定）
- Modal / Overlay（需 overlay layer、focus trap，暂缓）

---

## 贡献注意

1. TextInput 改动保留 grapheme 单测，并更新 mock E2E。
2. 勿扩大 Frame `width > 2` 或 placeholder 链，除非先更新 [DISPLAY_WIDTH.md](doc/specs/DISPLAY_WIDTH.md)。
3. Layout 新 prop 须同时补 vnode schema、JSX 类型、Yoga engine、测试，并运行 `npm run gen:layout-props` 更新 [LAYOUT_PROPS.md](doc/specs/LAYOUT_PROPS.md)。
