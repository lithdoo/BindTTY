import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = fs.readFileSync(
  path.join(root, "doc/archive/plans/M7_SCROLL_VIEWPORT_PLAN.md"),
  "utf8"
);
const lines = plan.split(/\r?\n/);
const body = lines.slice(59, 797).join("\n");

const header = `# Scroll / Viewport / List 规范（Scroll Viewport）

> **类型**：spec
> **范围**：@bindtty/layout · @bindtty/renderer-terminal · @bindtty/widgets · @bindtty/interaction
> **状态**：implemented
> **最后核对**：2026-07
> **代码入口**：packages/layout/src/ · packages/widgets/src/scroll/
> **相关**：[LAYOUT.md](../packages/LAYOUT.md) · [RENDERER.md](../packages/RENDERER.md) · [WIDGETS.md](../packages/WIDGETS.md) · [SCROLL.md](../widgets/SCROLL.md)

<!-- Widget API § 已外置至 doc/widgets/SCROLL.md；勿在此文件维护 VScrollView/HScrollView/ScrollView/List props -->

相关文档： [ROADMAP.md](../architecture/ROADMAP.md) · [E2E.md](../testing/E2E.md) · [DISPLAY_WIDTH.md](./DISPLAY_WIDTH.md)

---

## 1. 范围

### 1.1 已支持

- box clip/scroll layout props
- LayoutNode clip / scrollOffset / contentSize
- renderer clip stack 与 scroll offset
- ScrollView / List（受控 offset）
- 键盘滚动与 TextInput focus 优先级

### 1.2 不在范围内

- 虚拟列表、水平滚动、scrollbar、stickToBottom

---

`;

let out = body
  .replaceAll("[RENDERER.md](./RENDERER.md)", "[RENDERER.md](../packages/RENDERER.md)")
  .replaceAll("[LAYOUT.md](./LAYOUT.md)", "[LAYOUT.md](../packages/LAYOUT.md)")
  .replaceAll("[E2E_TESTING.md](./E2E_TESTING.md)", "[E2E.md](../testing/E2E.md)");

out += `\n\n## 12. 历史计划\n\n见 [archive/plans/M7_SCROLL_VIEWPORT_PLAN.md](../archive/plans/M7_SCROLL_VIEWPORT_PLAN.md)。\n`;

fs.writeFileSync(path.join(root, "doc/specs/SCROLL_VIEWPORT.md"), header + out);
console.log("wrote SCROLL_VIEWPORT.md");
