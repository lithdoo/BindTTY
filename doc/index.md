---
layout: home
hero:
  name: BindTTY
  text: 面向 MVVM + signal 的 TypeScript/TSX 终端 UI 框架
  tagline: 以 ViewModel binding 为核心，Yoga 布局 + 终端 ANSI diff，不是 React VDOM 复刻。
  actions:
    - theme: brand
      text: 架构设计
      link: /architecture/DESIGN
    - theme: alt
      text: 文档索引
      link: /README
    - theme: alt
      text: GitHub
      link: https://github.com/lithdoo/BindTTY
features:
  - title: Signal 驱动更新
    details: signal 变化触发 binding 失效，layout 与 paint 只 patch 变更部分。
  - title: TSX 优先
    details: 内置元素、show/for 控制流与 widgets 组合成终端 UI。
  - title: 真实终端就绪
    details: createApp + createNodeTerminal 支持 raw mode、焦点与键盘派发。
---

## 安装

```bash
npm install bindtty @bindtty/widgets
```

真实终端应用还需 `@bindtty/terminal`：

```bash
npm install @bindtty/terminal
```

`bindtty` 与 `@bindtty/widgets` 请使用匹配版本（例如均为 `0.1.0-alpha.2`）。

## tsconfig

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "bindtty"
  }
}
```

## 快速开始

```tsx
import { computed, createApp, createSignal } from "bindtty";
import { Button } from "@bindtty/widgets";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

const app = createApp(
  <vstack>
    <text value={label} />
    <Button label="+" onPress={() => count.set(count.get() + 1)} />
  </vstack>,
  { stdout: process.stdout, fallbackViewport: { width: 80, height: 24 } }
);

app.start();
```

## 终端模式

```tsx
import { createApp } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  rawMode: true
});

const app = createApp(view, { terminal });
app.start();
```

## 迁移（alpha.1 → alpha.2）

`bindtty` 不再 re-export widgets，控件从 `@bindtty/widgets` 导入：

```tsx
// 之前
import { createApp, Button } from "bindtty";

// 之后
import { createApp } from "bindtty";
import { Button } from "@bindtty/widgets";
```

`ScrollView` 已重命名为 `VScrollView`，详见 [widgets/SCROLL](/widgets/SCROLL)。

## 下一步

- [架构设计](/architecture/DESIGN) — 四层视图模型
- [bindtty createApp](/packages/APP) — 应用生命周期
- [控件概览](/widgets/README) — Button、TextInput、Select、滚动视图
- [完整文档索引](/README)
