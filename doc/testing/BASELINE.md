# BindTTY 重构基线

> 基线版本：`0.1.0-beta.3`  
> 记录日期：2026-07-29  
> 用途：`REFACTOR_TODO.md` M0 阶段的可复现构建、测试和性能对照

## 环境

| 项目 | 基线值 |
| --- | --- |
| OS/host | Linux / WSL |
| Node.js | `v20.19.2` |
| npm | `9.2.0` |
| TypeScript | `5.9.3`（仓库 `node_modules`） |
| BindTTY packages | 14（13 public，1 private E2E） |
| Examples | 6 private workspaces |

所有 TypeScript 命令必须使用仓库安装的 compiler。不要使用可能临时下载同名 npm
包的裸 `npx tsc`。

## 复现命令

从仓库根目录执行：

```bash
npm run build
npm test
```

2026-07-29 修改前实测：

| 命令 | 结果 | Wall time |
| --- | --- | ---: |
| `npm run build` | passed | 256.649 s |
| `npm test` | 731 passed / 2 skipped | 557.446 s |

Wall time 仅用于证明重复构建的成本，不作为跨机器性能 gate。

M0 单次构建图落地后，同一环境的 `npm run build` 为 129.396 s。该变化只消除了
重复 TypeScript 编译，测试集合保持不变。

M0 完整 gate 使用新的 `npm test` 入口耗时 186.488 s，结果仍为：

- unit：596 passed / 2 skipped；
- integration：64 passed；
- mock E2E（含 fixture validation）：49 passed；
- real PTY：22 passed；
- 合计：731 passed / 2 skipped。

相对原始 `npm test` 的 557.446 s，wall time 减少约 66.5%；该数字仅用于确认任务图
消除了重复构建，不作为跨机器性能承诺。

## 测试来源

| 测试层 | Passed | Skipped | 入口 |
| --- | ---: | ---: | --- |
| packages unit/integration | 660 | 2 | 各公开 package 的 `test` script |
| E2E fixture validation | 4 | 0 | `packages/e2e/scripts/*.test.mjs` |
| E2E mock | 45 | 0 | `packages/e2e/dist/mock/test/*.test.js` |
| E2E real PTY | 22 | 0 | `packages/e2e/dist/real/test/*.test.js` |
| 合计 | 731 | 2 | 根 `npm test` |

两个 skip 位于 terminal 测试，属于当前平台无法执行的 Windows/native 场景。新增 skip
必须记录名称、原因和计划启用的平台或里程碑。

## 已确认的构建重复

修改前的脚本存在以下重复：

- 根 build 先构建全部 packages，随后 E2E mock 和 real 各自再次执行完整
  `build:deps`。
- `@bindtty/input` build 会再次构建 text。
- `@bindtty/terminal` build 会再次构建 input，input 又再次构建 text。
- 根 `npm test` 逐 workspace 执行，每个 package test 又自行构建上游依赖。

M0-02 可以替换任务编排，但必须保持上述 731/2 测试集合可对应，并同时保留：

- package tests；
- Windows fixture validation；
- mock E2E；
- 串行 real PTY E2E。

## 基线变更规则

- 测试拆分、合并或移动后，记录旧入口到新入口的映射。
- 不以测试数量增加代替行为覆盖证明。
- skip 数量增加必须有明确 issue 和启用条件。
- 构建优化只能消除重复工作，不能通过跳过类型检查或测试换取耗时下降。
- Node/npm/TypeScript 主版本变化后重新记录基线，不直接和本页 wall time 比较。

## 最小性能基线

复现命令：

```bash
npm run benchmark:baseline
```

固定结果保存在
[`benchmarks/results/0.1.0-beta.3-linux-x64.json`](../../benchmarks/results/0.1.0-beta.3-linux-x64.json)。
当前脚本覆盖：

- 100,000 次 signal set/effect；
- 200 行 MountedNode tree 的完整 App frame；
- 100,000 UTF-16 code unit 的原子 paste parse；
- 5,000 个高基数字符串进入现有文本缓存后的 retained heap。

M0 数据只作为修改前对照，不作为 CI 强制阈值。M1 缓存和 paste 修复、M2 signal
调度、M4 frame 调度都必须使用相同 fixture 给出前后结果。
