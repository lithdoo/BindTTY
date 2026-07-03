# @bindtty/e2e

BindTTY 端到端测试，按目录区分两种运行方式：

| 目录 | 说明 | 命令 |
| --- | --- | --- |
| `mock/` | fake stdout/stdin | `npm run test:mock` |
| `real/` | `node-pty` 真实伪终端 | `npm run test:real` |

默认 `npm test` 会**两者都跑**。

## Mock E2E（`mock/`）

内存 fake stream，不依赖 TTY，覆盖 `createApp` + `createNodeTerminal` 全链路：

- 首屏渲染、signal 更新、resize、stop/restart、dispose
- Ctrl+C lifecycle、focus、Tab/Enter、Button、TextInput

```bash
npm test
```

## Real PTY E2E（`real/`）

通过 `node-pty` 启动 harness 子进程，子进程内 `process.stdout` / `process.stdin` 为真实 TTY：

```text
父进程 (node:test)
  └─ node-pty.spawn(node, harness-app.js)
       └─ 子进程：createNodeTerminal + createApp
            └─ marker 文件 (BINDTTY_E2E_MARKER) ← 侧信道断言
```

### 环境要求

- Node.js >= 18
- `node-pty`（可选依赖；未安装或编译失败时 real 测试自动 skip）
- Windows：本机跑 `npm run run:real:win`
- WSL：需带 Node.js 的 Linux 发行版（如 Ubuntu）

### 命令

在 `packages/e2e` 内：

```bash
npm test              # mock + real（默认）
npm run test:mock     # 仅 mock
npm run test:real     # 仅 PTY E2E
npm run test:all      # 同 npm test
npm run env:real      # 打印 PTY 环境信息
npm run run:real:win  # Windows 宿主
npm run run:real:wsl  # 从 Windows 调 WSL
```

在仓库根目录：

```bash
npm run test:e2e:real:env
npm run test:e2e:real
npm run test:e2e:real:win
npm run test:e2e:real:wsl
```

### Harness 应用（`real/harness/`）

| 文件 | 场景 |
| --- | --- |
| `counter-app.tsx` | Button Enter 递增 |
| `interaction-app.tsx` | TextInput 输入 + Enter 提交 |
| `focus-app.tsx` | Tab 切换 Button focus + Enter |
| `textedit-app.tsx` | TextInput Backspace 后提交 |
| `scroll-app.tsx` | ScrollView Down 键滚动 |
| `scroll-clamp-app.tsx` | ScrollView 受控 offset 超界时只 clamp 画面，按键后基于 applied offset 更新 |
| `list-app.tsx` | List Down 键滚动 |

## 目录结构

```text
packages/e2e/
  mock/
    test/app-terminal.test.tsx
  real/
    harness/          # PTY 子进程应用
    src/              # pty-session、marker-log、env
    test/pty-e2e.test.ts
  scripts/            # win/wsl 运行脚本
```
