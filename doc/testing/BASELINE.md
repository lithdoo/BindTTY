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

## M1 完成 gate

2026-07-29 在与 M0 相同的 Linux/WSL、Node.js `v20.19.2` 环境完成验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 752 passed / 2 skipped，189.983 s |
| `npm run check:dependencies` | passed |
| `npm run smoke:consumer` | 13 个公开包全部通过 |

测试分层结果为：

- unit：617 passed / 2 skipped；
- integration：64 passed；
- mock E2E：49 passed；
- real PTY：22 passed。

M1 性能原始结果保存在
[`benchmarks/results/m1-linux-x64.json`](../../benchmarks/results/m1-linux-x64.json)。
相同 fixture 下，文本缓存 retained heap 从 M0 的 2,627,224 bytes 降至
963,016 bytes，降低约 63.3%。完整 frame median 从 115.401 ms 变为 95.245 ms；
原子 paste 吞吐从约 20.11 亿变为 17.80 亿 UTF-16 code units/s。后两项容易受单机
运行噪声影响，仅记录结果，不作为性能承诺或强制阈值。原子 paste 仍只产生一个事件。

## M2 完成 gate

2026-07-29 在相同 Linux/WSL、Node.js `v20.19.2` 环境完成验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 766 passed / 2 skipped，183.603 s |
| `npm run check:dependencies` | passed |
| `npm run smoke:consumer` | 13 个公开包通过，signal 单实例检查通过 |

测试分层结果为：

- unit：631 passed / 2 skipped；
- integration：64 passed；
- mock E2E：49 passed；
- real PTY：22 passed。

M2 相比 M1 新增 14 个 signal 契约测试，无新增 skip。性能原始结果保存在
[`benchmarks/results/m2-linux-x64.json`](../../benchmarks/results/m2-linux-x64.json)。
相同的 100,000 次 source set/effect fixture 从 M0 的约 112 万 operations/s 变为
约 362 万 operations/s，单次实测提升约 223.7%；相对 M1 的约 280 万
operations/s 提升约 29.3%。完整 frame、paste 和 cache 指标也继续记录，但不是 M2
优化目标。所有单机 wall time 和 throughput 仅作为回归对照，不设跨机器强制阈值。

## M3 完成 gate

2026-07-29 在相同 Linux/WSL、Node.js `v20.19.2` 环境完成验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 779 passed / 2 skipped，180.078 s |
| `npm run check:dependencies` | passed |
| `npm run smoke:consumer` | 13 个公开包通过，runtime/signal dedupe 通过 |
| `npm run benchmark:ownership` | 4,000 次 mount/dispose 后无残留 effect |

测试分层结果为：

- unit：644 passed / 2 skipped；
- integration：64 passed；
- mock E2E：49 passed；
- real PTY：22 passed。

M3 相比 M2 新增 13 个 owner、runtime 和 widget 卸载契约测试，无新增 skip。重复资源
基准原始结果保存在
[`benchmarks/results/m3-ownership-linux-x64.json`](../../benchmarks/results/m3-ownership-linux-x64.json)。
fixture 连续执行两轮、每轮 2,000 次 component mount/dispose；强制 GC 后第一轮 retained
heap 为 378,064 bytes，第二轮增量为 35,448 bytes。完成 4,000 次卸载后更新公共 source，
残留 effect 执行数为 0。heap 数字仅用于同环境趋势观察，不设跨机器强制阈值；残留
effect 必须为 0。

## M4 完成 gate

2026-07-29 在相同 Linux/WSL、Node.js `v20.19.2` 环境完成验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 786 passed / 2 skipped，162.041 s |
| `npm run check:dependencies` | passed |
| `npm run smoke:consumer` | 13 个公开包通过 |
| `npm run benchmark:baseline` | passed |
| `npm run benchmark:frames` | paint/layout/structure intent 契约通过 |

测试分层结果为：

- unit：644 passed / 2 skipped；
- integration：71 passed；
- mock E2E：49 passed；
- real PTY：22 passed。

M4 相比 M3 新增 7 个 App 调度、布局复用、stdout 背压、错误恢复和 lifecycle 测试，
无新增 skip。通用性能原始结果保存在
[`benchmarks/results/m4-linux-x64.json`](../../benchmarks/results/m4-linux-x64.json)：
完整 frame median 为 80.205 ms，相比 M0 的 115.401 ms 单次实测降低约 30.5%。
该初始完整帧指标容易受运行噪声影响，不代表增量调度收益。

M4 新增的分级 fixture 保存在
[`benchmarks/results/m4-frame-intents-linux-x64.json`](../../benchmarks/results/m4-frame-intents-linux-x64.json)。
100 次 paint-only 更新只调用 1 次 layout（初始布局），而 layout 与 structure fixture
各调用 101 次。M0 没有分级 fixture，因此本次结果作为后续里程碑的首份增量调度基线；
吞吐数字只作同环境趋势观察，layout 调用次数是强制契约。

## M5 完成 gate

2026-07-29 在相同 Linux/WSL、Node.js `v20.19.2` 环境完成验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 792 passed / 2 skipped，185.221 s |
| `npm run check:dependencies` | passed |
| `npm run smoke:consumer` | 13 个公开包通过 |

测试分层结果为：

- unit：650 passed / 2 skipped；
- integration：71 passed；
- mock E2E：49 passed；
- real PTY：22 passed。

M5 将 `host.ts` 收口为 177 行组合根，组合一次性解析的
`ResolvedTerminalProfile`、`InputSession`、`ResizeCoordinator`、`TerminalOutput`
和 `LifecycleGuard`。新增事件依赖、raw/frame 输出、profile、pending SS3、
session restart、共享 signal hook 和已知 host capability 契约测试，无新增 skip。

DECRQM 暂不实现：当前采用已知 host profile、保守 fallback 与显式 override，避免引入
第二个 stdin consumer；未来只有 ADR 和实测收益成立时才经 InputSession 增加查询。
uncaught exception/unhandled rejection 不注册额外全局 handler，避免改变应用错误语义；
同步 start/stop/dispose 回滚与 SIGINT/SIGTERM/SIGHUP 使用 best-effort 恢复。
Windows Terminal、PowerShell、conhost/ConPTY 实机矩阵仍按计划留在 M7 执行。
