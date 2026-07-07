# @bindtty/input 分阶段落地计划

## 目标

将终端键盘输入解析从 `@bindtty/terminal` 中拆出来，沉淀到独立的 `@bindtty/input` 包。

`@bindtty/input` 只负责一件事：把原始终端输入 `Buffer | string` 解析为稳定、统一的按键事件。`@bindtty/terminal` 继续负责终端生命周期，包括 raw mode、stdin/stdout 绑定、增强键盘协议启停、resize、事件派发。

最终目标是：

- dayloom 不维护自己的输入解析器。
- widgets 不关心终端协议，只消费标准化按键事件。
- Ctrl+Enter、宽字符、未知 escape 序列等问题都在输入层集中解决。
- 后续新增终端兼容时，只改 `@bindtty/input` 和必要的 terminal 协议启停逻辑。

## 设计原则

- `@bindtty/input` 不依赖 runtime、renderer、widgets、vnode、signal。
- 采用类似 terminal-kit 的结构：keymap、reverse keymap、动态序列 handler。
- 不照搬 terminal-kit 整套代码。terminal-kit 的 parser 和它自己的 `Terminal` 对象、event emitter、termconfig、mouse、clipboard、cursor location 等能力耦合较深。
- 未识别的 escape/control 序列不能泄漏成普通文本。
- 保持 `TerminalKeyEvent` 行为兼容，避免下游大面积改动。
- Kitty keyboard protocol 和 xterm modifyOtherKeys 是一等输入协议，不应作为 dayloom 特例处理。
- 如果终端只发普通 `\r`，不能猜测它是 Ctrl+Enter。没有 modifier 信息时必须保持普通 Enter。

## 目标接口

第一阶段公开纯函数接口：

```ts
export interface InputKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}

export interface InputUnknownEvent {
  input: "";
  name: "unknown";
  ctrl: false;
  meta: false;
  shift: false;
  sequence: string;
}

export type InputEvent = InputKeyEvent | InputUnknownEvent;

export interface ParseInputChunkOptions {
  keymap?: InputKeymap;
}

export function parseInputChunk(
  chunk: Buffer | string,
  options?: ParseInputChunkOptions
): Iterable<InputEvent>;
```

后续增加有状态 parser：

```ts
export interface InputParser {
  parse(chunk: Buffer | string): InputEvent[];
  reset(): void;
}

export function createInputParser(options?: ParseInputChunkOptions): InputParser;
```

有状态 parser 用于处理跨 chunk 的 UTF-8 字符、escape 序列、Kitty 序列等。

## 阶段 1：空包骨架

状态：已完成。

范围：

- 新增 `packages/input/package.json`。
- 新增 `README.md`。
- 新增本计划文档。
- 不接入 `@bindtty/terminal`。
- 不增加运行时依赖。

验收：

- `@bindtty/input` 作为 workspace 包存在。
- 现有包行为不变。

## 阶段 2：无行为变化迁移现有 parser

状态：已完成。

范围：

- 将 `packages/terminal/src/raw-input.ts` 中的解析逻辑迁入 `packages/input/src/parser.ts`。
- 导出 `parseInputChunk`。
- 保持事件结构兼容现有 `TerminalKeyEvent`。
- 将 raw parser 单测从 `@bindtty/terminal` 迁到 `@bindtty/input`。
- `@bindtty/terminal` 暂时保留薄封装，避免一次性改动过大。

验收：

- `@bindtty/input` 覆盖现有 raw parser 行为。
- `@bindtty/terminal` 测试继续通过。
- dayloom 真实 PTY 测试继续通过。

## 阶段 3：keymap / reverse keymap 核心

状态：已完成。

范围：

- 将零散条件分支替换为表驱动结构。
- 定义固定按键表：

```ts
interface FixedKeymapEntry {
  name: string;
  input?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequences: readonly string[];
}
```

- 构建 reverse keymap：
  - 按 sequence 长度索引。
  - 优先最长匹配。
  - 同一序列可记录多个别名。
- printable text 解析与 control/escape 解析分离。

验收：

- 行为与阶段 2 一致。
- 新增固定序列只需要改 keymap，不需要改 parser 主流程。
- 回归测试全部通过。

## 阶段 4：动态序列 handler

状态：已完成。

范围：

- 增加变量长度序列处理：

```ts
interface DynamicKeymapEntry {
  starter: string;
  ender: string | readonly string[];
  parse(payload: string, sequence: string): InputEvent | null;
}
```

- 实现 handler：
  - CSI tilde navigation
  - CSI letter navigation
  - SS3 navigation
  - Windows prefixed keys
  - xterm modifyOtherKeys
  - Kitty keyboard protocol
  - unknown CSI fallback

验收：

- 变量长度序列会被消费成一个事件。
- 未知 CSI/Kitty family 序列输出 `unknown`，不泄漏成文本。
- 支持 Ctrl+Enter 的已知变体。

## 阶段 5：有状态 parser

状态：已完成。

范围：

- 新增 `createInputParser()`。
- parser 内部保留 partial buffer。
- 正确处理：
  - UTF-8 字符跨 chunk。
  - ESC/CSI 序列跨 chunk。
  - Kitty 序列跨 chunk。
  - 已知 starter 后续暂未到齐。

开放决策：

- timeout 是否属于 `@bindtty/input`。
- 倾向：`@bindtty/input` 只保存 partial；是否超时 flush 由 `@bindtty/terminal` 决定。

验收：

- 完整 chunk 和拆分 chunk 产出一致事件。
- partial unknown 不会提前污染文本。
- `reset()` 可以清掉 partial 状态。

## 阶段 6：接入 @bindtty/terminal

状态：已完成。

范围：

- `@bindtty/terminal` 增加 `@bindtty/input` 依赖。
- `RawStdinInput` 改为调用 `createInputParser()`。
- 删除 `@bindtty/terminal` 内重复 raw parser。
- 保持 `TerminalKeyEvent` 类型稳定。
- `enhancedKeyboard` 协议启停仍留在 `@bindtty/terminal`。

验收：

- `@bindtty/terminal` 单测通过。
- `@bindtty/e2e` 真实 PTY 通过。
- dayloom 不需要 app-local parser。

## 阶段 7：协议覆盖加固

状态：部分完成，已覆盖当前 textarea/Ctrl+Enter 路径所需协议；终端兼容矩阵仍需继续补。

范围：

- Kitty keyboard protocol：
  - modifier encoding。
  - `:` event type 后缀。
  - Enter/Return 变体。
  - 文本键与控制键的差异。
- xterm modifyOtherKeys：
  - `CSI 27 ; modifier ; code ~`
  - `CSI code ; modifier u`
  - 各终端偏差。
- 传统终端：
  - CSI arrows。
  - SS3 arrows。
  - Home/End/PageUp/PageDown。
  - Backspace/Delete/Tab。
- Windows：
  - `\x00` / `\xe0` prefixed keys。

验收：

- 所有支持的 Ctrl+Enter 序列映射为：

```ts
{
  input: "\r",
  name: "return",
  ctrl: true,
  meta: false,
  shift: false
}
```

- 普通 `\r` 仍然是普通 Enter。
- 不支持 modifier 的终端不会被误判。

## 阶段 8：第三方库评估

状态：已完成初步评估，暂不引入第三方运行时依赖。

范围：

- 评估是否引入窄依赖，例如 `kitty-keys`。
- terminal-kit 仅作为架构参考，默认不作为依赖引入。

判断标准：

- 依赖必须专注输入协议解析。
- 不能接管 stdin/stdout 生命周期。
- 不能引入另一套 TUI/Terminal 抽象。
- 能与 `InputEvent` 事件结构兼容。
- 能处理 unknown/fallback 策略，或者允许我们包一层处理。

初步结论：

- terminal-kit 的思路值得借鉴：keymap、reverse keymap、dynamic handler。
- terminal-kit 本身不适合作为直接依赖：它是完整 terminal framework。
- `kitty-keys` 更适合作为 Kitty protocol 子解析器候选，但还需代码级验证。

## 完整测试计划

### 1. 单元测试：基础字符输入

覆盖：

- ASCII printable：`a`、`A`、`1`、space。
- CJK：`中`。
- emoji：`🙂`。
- combining mark：`e\u0301`。
- 多字符连续输入：`abc`。

验收：

- 每个 grapheme/code point 事件不被错误拆分。
- printable 输入不设置 `name`。
- `sequence` 保留原始输入片段。

### 2. 单元测试：基础控制键

覆盖：

- Enter：`\r`、`\n`。
- Backspace：`\x7f`、`\b`。
- Tab：`\t`。
- Ctrl+C：`\x03`。
- Ctrl+A 到 Ctrl+Z。

验收：

- Enter 映射到 `name: "return", input: "\r"`。
- Ctrl+C 映射到 `name: "c", ctrl: true`。
- 控制键不泄漏为文本。

### 3. 单元测试：传统导航键

覆盖：

- CSI arrows：`\x1b[A/B/C/D`。
- SS3 arrows：`\x1bOA/B/C/D`。
- Home/End：`\x1b[H`、`\x1b[F`、`\x1bOH`、`\x1bOF`。
- PageUp/PageDown：`\x1b[5~`、`\x1b[6~`。
- Insert/Delete：`\x1b[2~`、`\x1b[3~`。

验收：

- 事件 name 正确。
- `input` 为空。
- 不产生额外字符事件。

### 4. 单元测试：modifier navigation

覆盖：

- Shift arrows：`\x1b[1;2A` 等。
- Alt arrows：`\x1b[1;3A` 等。
- Ctrl arrows：`\x1b[1;5A` 等。
- Ctrl+Shift arrows：`\x1b[1;6A` 等。
- 同类 Home/End/PageUp/PageDown modifier 变体。

验收：

- `ctrl/meta/shift` flags 正确。
- 不同终端同义序列映射一致。

### 5. 单元测试：Ctrl+Enter 与 modified Enter

覆盖：

- Kitty/fixterms:
  - `\x1b[13;5u`
  - `\x1b[10;5u`
  - `\x1b[13;5:3u`
- modifyOtherKeys:
  - `\x1b[27;5;13~`
- CSI tilde variant:
  - `\x1b[13;5~`
- Meta/Alt Enter:
  - `\x1b[13;3u`
  - `\x1b[27;3;13~`
- Shift Enter:
  - `\x1b[13;2u`

验收：

- Ctrl+Enter 统一映射为 `ctrl: true`。
- Meta/Alt Enter 统一映射为 `meta: true`。
- Shift Enter 统一映射为 `shift: true`。
- 普通 `\r` 不带 modifier。

### 6. 单元测试：Kitty keyboard protocol

覆盖：

- 带 event type 的冒号格式。
- modifier 编码组合：Shift、Alt、Ctrl、Ctrl+Alt。
- 非 Enter 键的 Kitty 序列。
- 不认识的 Kitty 序列。

验收：

- 已支持键输出标准事件。
- 未支持键输出 `unknown`，不泄漏文本。
- payload 中 `:` 不破坏解析。

### 7. 单元测试：xterm modifyOtherKeys

覆盖：

- `CSI 27 ; modifier ; code ~`
- ASCII code 对应 Enter、Tab、Backspace、Space、字母。
- modifier 组合。

验收：

- 已知 code 映射正确。
- 不支持 code 输出 `unknown`。
- 不产生残余 printable 字符。

### 8. 单元测试：未知序列与污染防护

覆盖：

- 未知 CSI：`\x1b[99;9~`。
- 未知带冒号 CSI：`\x1b[99;9:1u`。
- 不完整 ESC：`\x1b`。
- 不完整 CSI：`\x1b[`。
- 已知 prefix 但无 ender。

验收：

- 完整未知序列输出 `unknown`。
- 不完整序列在 stateful parser 中暂存。
- reset 后 partial 被清空。
- 任意未知控制序列不能变成 textarea 文本。

### 9. 单元测试：跨 chunk 输入

覆盖：

- UTF-8 字符拆分。
- `\x1b[13;5u` 拆分成多个 chunk。
- `\x1b[13;5:3u` 拆分。
- unknown CSI 拆分。
- 普通文本和 escape 混合拆分。

验收：

- 拆分输入和完整输入输出一致。
- partial buffer 不丢数据。
- 不提前 emit 错误文本。

### 10. 集成测试：@bindtty/terminal

覆盖：

- `RawStdinInput` 使用 `@bindtty/input`。
- `createNodeTerminal({ enhancedKeyboard: true })` 启用协议。
- stop/dispose 恢复协议。
- `exitOnCtrlC` 行为不回退。

验收：

- lifecycle ANSI 输出顺序稳定。
- raw input adapter 能派发 `InputEvent` 到 `TerminalKeyEvent`。
- terminal 现有测试全部通过。

### 11. Widget 集成测试

覆盖：

- `Textarea` 收到 Ctrl+Enter 后触发 `onSubmit`。
- 普通 Enter 仍插入换行。
- unknown key 不改变 value。
- 输入污染防护：unknown CSI 不出现在 textarea value。

验收：

- `@bindtty/widgets` 测试通过。
- `Textarea` 不需要知道具体终端协议。

### 12. 真实 PTY 测试

覆盖：

- 使用 `node-pty` 启动真实 TUI。
- 发送：
  - 普通 Enter。
  - `\x1b[13;5u`。
  - `\x1b[13;5~`。
  - `\x1b[13;5:3u`。
  - unknown CSI。
- 验证：
  - Enter 换行显示。
  - Ctrl+Enter 提交。
  - unknown CSI 不污染输入框。

验收：

- `@bindtty/e2e` 通过。
- dayloom TUI e2e 通过。

### 13. 终端兼容矩阵

至少记录并逐步验证：

- Kitty
- WezTerm
- Ghostty
- iTerm2
- Alacritty
- macOS Terminal
- GNOME Terminal
- Windows Terminal
- tmux 内外两种环境

每个终端记录：

- 是否支持 Kitty keyboard protocol。
- 是否支持 modifyOtherKeys。
- Ctrl+Enter 实际发出的序列。
- 是否需要额外配置。
- 不支持时的 fallback 行为。

### 14. 回归测试清单

每次改 input parser 必跑：

- `npm test -w @bindtty/input`
- `npm test -w @bindtty/terminal`
- `npm test -w @bindtty/widgets`
- `npm test -w @bindtty/e2e`
- dayloom: `npm test -w @dayloom/tui`

如改 enhanced keyboard lifecycle，还要人工或脚本验证：

- TUI 退出后终端没有残留键盘模式。
- Ctrl+C 仍可退出。
- 普通 shell 输入不受影响。

## 非目标

- 不把终端生命周期移到 `@bindtty/input`。
- 不让 `@bindtty/input` 依赖 widgets/runtime/renderer/vnode/signal。
- 不让 app 直接维护终端协议解析。
- 不从普通 `\r` 猜 Ctrl+Enter。
- 不把 terminal-kit 作为整体依赖引入。

## 迁移检查清单

- [x] 创建包骨架。
- [x] 迁移现有 raw parser 到 `@bindtty/input`。
- [x] 迁移 parser 单测。
- [x] 引入 keymap/reverse keymap。
- [x] 引入 dynamic handler。
- [x] 引入 stateful parser。
- [x] `@bindtty/terminal` 接入 `@bindtty/input`。
- [x] 删除 `@bindtty/terminal` 内重复 raw parser。
- [x] 补齐 widgets 集成测试。
- [x] 补齐真实 PTY e2e。
- [x] 验证 dayloom TUI。
