# @bindtty/input Ink 式输入解析改造方案

## 背景

当前 `@bindtty/input` 已经完成从 `@bindtty/terminal` 拆包，并支持：

- `parseInputChunk(chunk)` 纯函数入口。
- `createInputParser()` 有状态入口。
- UTF-8 Buffer 跨 chunk 解码。
- CSI / SS3 / Kitty / modifyOtherKeys 的基础解析。
- Ctrl+Enter 多种终端序列。
- unknown CSI 防污染。

这版能解决 dayloom textarea 的当前问题，但内部结构仍然偏“一层 parser 直接产出最终事件”。后续继续补 Kitty protocol、bracketed paste、Alt+字符、F1-F12、event type、release/repeat 时，单层结构会越来越难维护。

Ink 的输入处理更适合长期维护：先把 stdin chunk 切成完整输入 token，再把 token 解析成 key event。`@bindtty/input` 可以参考这个架构，但不直接依赖 Ink，也不照搬 React hook 层。

## 当前落地状态

已完成：

- 拆出 `events.ts`、`keymap.ts`、`modifiers.ts`、`tokenizer.ts`、`parse-token.ts`。
- `index.ts` 保持对外 API 稳定，并组合 tokenizer + token parser。
- tokenizer 支持 text/control/CSI/SS3/Win32 prefix/bracketed paste/unknown token。
- CSI 使用标准 final byte 区间识别完整序列。
- UTF-8 Buffer 跨 chunk 仍由 `StringDecoder` 处理。
- parser 支持 Kitty/fixterms、xterm modifyOtherKeys、CSI/SS3 navigation、Alt+字符。
- `createInputParser()` 增加 `hasPending()`。
- bracketed paste 默认展开为 text events，也可通过 `pasteMode: "event"` 输出 paste event。
- 保持 terminal、widgets、dayloom 现有行为兼容。

暂未做：

- terminal 层 pending ESC timeout。
- widgets 对 `name: "paste"` 的专门批量处理。
- Kitty release/repeat 对 widgets 的显式策略。
- 终端兼容矩阵实机记录。

## 改造目标

- 保持 `@bindtty/input` 对外 API 稳定。
- 内部拆成 tokenizer、sequence parser、event mapper 三层。
- 明确处理 pending escape、pending UTF-8、bracketed paste、unknown control sequence。
- Kitty keyboard protocol 和 xterm modifyOtherKeys 独立解析，不继续混在 CSI 特例里。
- unknown 序列必须被消费成 `unknown`，不能泄漏到 textarea value。
- 普通 `\r` 不猜 Ctrl+Enter；只有终端明确发 modifier 序列才产生 Ctrl+Enter。
- `@bindtty/terminal` 只负责 raw mode、enhanced keyboard 协议启停、事件派发。
- widgets/dayloom 不感知终端协议。

## 非目标

- 不把 `@bindtty/input` 改成 Ink 依赖。
- 不引入 React/Ink 的 hook、context、event emitter。
- 不把 terminal 生命周期移入 input 包。
- 不为了支持所有终端一次性做大而全的兼容表。
- 不改变 textarea 的业务交互语义。

## 现有问题

### 1. Token 切分和 key 解析耦合

当前 `parseSource()` 同时负责：

- 固定序列最长匹配。
- 动态 CSI 序列查找。
- printable code point 输出。
- pending 判断。
- unknown fallback。

这会导致新增协议时需要频繁碰主循环。

### 2. CSI 结束规则不够通用

当前 dynamic handler 使用手写 enders：

```ts
enders: ["u", "~", "A", "B", "C", "D", "H", "F"]
```

这能覆盖当前 Ctrl+Enter 和导航键，但 CSI 的标准结束规则更通用：

- parameter bytes: `0x30-0x3f`
- intermediate bytes: `0x20-0x2f`
- final byte: `0x40-0x7e`

应改为按字节区间识别完整 CSI，而不是提前枚举所有 final。

### 3. Kitty protocol 应独立

当前 Kitty/fixterms 风格的 `CSI ... u` 和 modified Enter 混在 `parseModifiedEnter()` 中。后续要支持：

- codepoint key。
- modifier 组合。
- event type。
- alternate key。
- shifted key。
- text-as-codepoint。
- release/repeat。

需要独立 parser。

### 4. Bracketed paste 缺失

终端粘贴通常是：

```txt
\x1b[200~ pasted text \x1b[201~
```

如果不作为 paste token 处理，粘贴中的 escape 序列可能被误解析成按键。

### 5. Pending 状态能力不够显式

现在有 `flush()` 和 `reset()`，但没有：

- `hasPending()`。
- pending kind。
- pending timeout 建议。
- pending ESC 是否可 flush 成单独 Escape 键。

terminal 层后续要做 timeout flush 时，需要更明确的状态。

## 目标架构

内部改为三层。

```txt
Buffer|string chunk
  -> InputTokenizer
  -> RawInputToken[]
  -> parseInputToken()
  -> InputEvent[]
```

对外仍保留：

```ts
parseInputChunk(chunk, options?)
createInputParser(options?)
```

### 第一层：InputTokenizer

只负责从 chunk 中切出完整 token，不做业务 key 命名。

```ts
export type RawInputToken =
  | TextToken
  | ControlToken
  | EscapeToken
  | CsiToken
  | Ss3Token
  | PasteToken
  | UnknownToken;

export interface TextToken {
  type: "text";
  value: string;
  sequence: string;
}

export interface ControlToken {
  type: "control";
  sequence: string;
}

export interface EscapeToken {
  type: "escape";
  sequence: string;
}

export interface CsiToken {
  type: "csi";
  sequence: string;
  payload: string;
  final: string;
}

export interface Ss3Token {
  type: "ss3";
  sequence: string;
  final: string;
}

export interface PasteToken {
  type: "paste";
  value: string;
  sequence: string;
}

export interface UnknownToken {
  type: "unknown";
  sequence: string;
}
```

Tokenizer 状态：

```ts
export interface InputTokenizer {
  tokenize(chunk: Buffer | string): RawInputToken[];
  flush(): RawInputToken[];
  reset(): void;
  hasPending(): boolean;
}
```

Tokenizer 规则：

- 使用 `StringDecoder("utf8")` 处理 Buffer。
- 普通 printable 文本可以按 code point 产出 token。
- `\x1b[` 进入 CSI pending。
- CSI 使用标准 final byte 区间结束。
- `\x1bO` 进入 SS3 pending。
- `\x1b[200~` 开始 bracketed paste。
- paste 模式下直到 `\x1b[201~` 都视为 paste 内容，不解析中间 escape。
- 不完整 ESC/CSI 在 `flush()` 时变成 `unknown` 或 Escape key，具体由 policy 决定。

### 第二层：Sequence Parser

只负责把单个 token 解析成结构化 key。

```ts
export interface ParsedKey {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  codepoint?: number;
  eventType?: "press" | "repeat" | "release";
  protocol?: "legacy" | "csi" | "ss3" | "kitty" | "modifyOtherKeys" | "win32";
}

export function parseInputToken(token: RawInputToken): ParsedKey | InputPasteEvent | InputUnknownEvent;
```

拆成独立模块：

```txt
src/tokenizer.ts
src/parse-token.ts
src/parsers/control.ts
src/parsers/csi.ts
src/parsers/ss3.ts
src/parsers/kitty.ts
src/parsers/modify-other-keys.ts
src/parsers/win32.ts
src/keymap.ts
src/modifiers.ts
src/events.ts
src/index.ts
```

### 第三层：Public Event Mapper

保持当前外部事件兼容。

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

export interface InputPasteEvent {
  input: string;
  name: "paste";
  ctrl: false;
  meta: false;
  shift: false;
  sequence: string;
}
```

是否公开 `InputPasteEvent` 需要分阶段做：

- 第一阶段内部支持 paste，但默认展开为多个 text event，保证兼容。
- 第二阶段公开 `name: "paste"`，widgets 可以选择更高效处理。

## API 兼容策略

当前 API 保留：

```ts
export function parseInputChunk(
  chunk: Buffer | string,
  options?: ParseInputChunkOptions
): Iterable<InputEvent>;

export function createInputParser(
  options?: ParseInputChunkOptions
): InputParser;
```

新增可选 API：

```ts
export interface InputParser {
  parse(chunk: Buffer | string): InputEvent[];
  flush(): InputEvent[];
  reset(): void;
  hasPending(): boolean;
}

export interface ParseInputChunkOptions {
  keymap?: InputKeymap;
  pasteMode?: "text" | "event";
  escapeFlushMode?: "unknown" | "escape";
}
```

默认：

- `pasteMode: "text"`，保持 textarea 行为兼容。
- `escapeFlushMode: "unknown"`，保持当前 unknown 防污染策略。

## 分阶段落地计划

### 阶段 1：测试冻结现有行为

范围：

- 当前 `@bindtty/input` 单测作为行为基线。
- 增加更多 golden tests，但先不改实现。

新增覆盖：

- 普通 ASCII / CJK / emoji。
- UTF-8 Buffer 跨 chunk。
- ESC / CSI / Kitty 跨 chunk。
- unknown CSI 不污染文本。
- Ctrl+Enter 所有当前支持变体。
- Windows prefixed keys。

验收：

- `npm test -w @bindtty/input` 通过。
- `npm test -w @bindtty/terminal` 通过。

### 阶段 2：引入 tokenizer，但保持旧 parser 产出

范围：

- 新增 `src/tokenizer.ts`。
- tokenizer 只产出内部 token，不改公开 API。
- `parseInputChunk()` 仍输出现有 `InputEvent`。

重点：

- 使用标准 CSI final byte 规则。
- 支持 SS3 token。
- 支持 `flush()`。
- 支持 `hasPending()`。

验收：

- 现有测试全部通过。
- 新增 tokenizer 单测通过。
- 不改 terminal/widgets/dayloom。

### 阶段 3：把 legacy keymap 迁到 token parser

范围：

- 新增 `src/parse-token.ts`。
- 新增 `src/keymap.ts`。
- 固定键表从 `index.ts` 移出。
- `ControlToken`、`EscapeToken`、`CsiToken`、`Ss3Token` 分别解析。

验收：

- 现有 `InputEvent` 输出完全一致。
- `src/index.ts` 只做组合和 re-export。

### 阶段 4：独立 Kitty parser

范围：

- 新增 `src/parsers/kitty.ts`。
- 只处理 `CSI ... u`。
- 支持：
  - codepoint。
  - modifier。
  - `:` event type。
  - Enter/Return。
  - Tab/Backspace/Escape。
  - printable codepoint。

modifier 规则：

```txt
kitty modifier value - 1:
1 Shift
2 Alt/Meta
4 Ctrl
```

event type 映射：

```txt
1 press
2 repeat
3 release
```

验收：

- `\x1b[13;5u` -> Ctrl+Enter。
- `\x1b[13;5:3u` -> Ctrl+Enter release metadata 可保留，但默认仍作为 key event 输出。
- unknown Kitty 序列 -> unknown，不落回文本。

### 阶段 5：独立 modifyOtherKeys parser

范围：

- 新增 `src/parsers/modify-other-keys.ts`。
- 支持：
  - `CSI 27 ; modifier ; code ~`
  - `CSI code ; modifier u`

验收：

- `\x1b[27;5;13~` -> Ctrl+Enter。
- Alt/Shift/Ctrl 组合 flags 正确。
- 不支持 code -> unknown。

### 阶段 6：Bracketed paste

范围：

- tokenizer 支持 `\x1b[200~` / `\x1b[201~`。
- paste 模式期间不解析中间 escape。
- 默认 `pasteMode: "text"` 输出普通 text events。
- 可选 `pasteMode: "event"` 输出 `name: "paste"`。

验收：

- 粘贴 `a\x1b[A b` 不触发 up key。
- textarea value 得到原始粘贴文本。
- unknown 序列不污染 paste 边界外文本。

### 阶段 7：terminal pending timeout 接入

范围：

- `@bindtty/input` 提供 `hasPending()`。
- `@bindtty/terminal` 可选实现 pending ESC timeout。

建议：

```ts
enhancedKeyboard?: boolean;
inputPendingTimeoutMs?: number;
```

默认可以先不启用 timeout，避免行为变化。

验收：

- 单独按 Escape 时不会永久卡住。
- 拆分的 CSI/Kitty 序列不会被过早 flush。

### 阶段 8：widgets/dayloom 回归

范围：

- Textarea：
  - 普通 Enter 换行。
  - Ctrl+Enter 提交。
  - unknown 不污染 value。
  - paste 写入 value。
- TextInput：
  - CJK/emoji/combining mark 不回退。
  - arrows 不泄漏。
- dayloom：
  - 无 submit 按钮。
  - Ctrl+Enter 提交。
  - 输入框视觉换行继续正常。

验收：

- `npm test -w @bindtty/widgets`
- `npm test -w @bindtty/e2e`
- `npm test -w @dayloom/tui`

## 测试计划

### 1. Tokenizer 单测

覆盖：

- text token。
- control token。
- CSI token。
- SS3 token。
- ESC pending。
- CSI pending。
- UTF-8 Buffer split。
- bracketed paste。
- unknown escape。

验收：

- token 边界正确。
- 不完整序列在 `parse()` 中 pending，在 `flush()` 中按 policy 输出。

### 2. Parser 单测

覆盖：

- legacy arrows。
- SS3 arrows。
- Home/End/PageUp/PageDown。
- Insert/Delete。
- Backspace/Tab/Enter。
- Ctrl+C。
- Ctrl+A 到 Ctrl+Z。
- Alt+字符。
- F1-F12。

验收：

- `input/name/ctrl/meta/shift/sequence` 正确。
- 非文本键 `input` 为空，Enter 例外保持 `\r`。

### 3. Kitty 单测

覆盖：

- Ctrl+Enter。
- Alt+Enter。
- Shift+Enter。
- Ctrl+Alt+Enter。
- event type press/repeat/release。
- printable codepoint。
- unknown payload。

验收：

- modifier flags 正确。
- event type 不破坏现有 widgets 行为。
- unknown 不泄漏。

### 4. modifyOtherKeys 单测

覆盖：

- `CSI 27 ; modifier ; code ~`。
- `CSI code ; modifier u`。
- Enter/Tab/Backspace/Escape/Space/letters。
- modifier 组合。

验收：

- 已知 code 正确。
- 未知 code unknown。

### 5. Paste 单测

覆盖：

- 普通 paste。
- paste 中包含 ESC。
- paste 中包含 CSI。
- paste 跨 chunk。
- paste 未结束后 flush。

验收：

- paste 中内容不被当成 key。
- 未结束 paste 不污染后续 parser 状态。

### 6. Terminal 集成测试

覆盖：

- `RawStdinInput` 使用有状态 parser。
- split Ctrl+Enter。
- split emoji Buffer。
- pending reset on detach。
- enhanced keyboard lifecycle 不变。

### 7. 真实 PTY E2E

覆盖：

- Textarea Enter 换行。
- Textarea Ctrl+Enter 提交。
- Textarea paste。
- unknown CSI 不污染输入框。
- disabled textarea arrow scroll。

## 风险与处理

### 风险 1：Escape 单键延迟

如果 ESC 既可能是 Alt 前缀，又可能是单独 Escape，就需要 timeout。

处理：

- input 包只提供 `hasPending()` 和 `flush()`。
- timeout 放在 terminal 层。
- 默认不启用或设置保守值。

### 风险 2：Paste 事件改变 widgets 语义

处理：

- 第一阶段默认 paste 展开为 text events。
- widgets 后续再选择是否处理 `name: "paste"`。

### 风险 3：Kitty release/repeat 导致重复提交

处理：

- 默认只把 press 作为普通 key event。
- repeat/release 可以带 metadata，但 widgets 默认忽略 release。
- Ctrl+Enter submit 只响应 press 或没有 event type 的兼容序列。

### 风险 4：未知序列过度吞噬

处理：

- CSI 使用标准 final byte 结束。
- 非 CSI/SS3/known control 不无限等待。
- 添加 unknown golden tests。

## 推荐文件结构

```txt
packages/input/src/
  index.ts
  events.ts
  tokenizer.ts
  parse-token.ts
  keymap.ts
  modifiers.ts
  parsers/
    control.ts
    csi.ts
    kitty.ts
    modify-other-keys.ts
    ss3.ts
    win32.ts
```

## 推荐实施顺序

1. 先补测试，不改行为。
2. 引入 tokenizer，并让旧测试全绿。
3. 把 parser 逻辑从 `index.ts` 拆到 `parse-token.ts`。
4. 独立 Kitty parser。
5. 独立 modifyOtherKeys parser。
6. 增加 bracketed paste。
7. terminal 层可选 pending timeout。
8. 跑 widgets/e2e/dayloom 全量回归。

## 最终验收命令

```bash
npm test -w @bindtty/input
npm test -w @bindtty/terminal
npm test -w @bindtty/widgets
npm test -w @bindtty/e2e
```

dayloom：

```bash
npm test -w @dayloom/tui
```

## 结论

`@bindtty/input` 应该参考 Ink 的输入处理方式，但只参考内部架构：

- chunk/tokenizer 分层。
- key sequence parser 分层。
- pending escape 显式管理。
- bracketed paste 独立处理。
- Kitty / modifyOtherKeys 独立 parser。

不要引入 Ink 作为依赖，也不要把 React/Ink 的应用生命周期搬进 bindtty。这样既能保留 bindtty 当前最小、独立的包边界，又能让输入解析能力向成熟终端框架靠拢。
