# @bindtty/input

> **类型**：package  
> **范围**：@bindtty/input  
> **状态**：implemented  
> **最后核对**：2026-07  
> **代码入口**：packages/input/src/index.ts  
> **相关**：[TERMINAL.md](./TERMINAL.md) · [INTERACTION.md](./INTERACTION.md) · [WIDGETS.md](./WIDGETS.md)

`@bindtty/input` 是 BindTTY 的终端键盘输入解析层。它把 raw stdin chunk 解析成稳定的 `InputEvent`，供 `@bindtty/terminal` 派发给 interaction/widgets。

## 边界

负责：

- `Buffer | string` 输入解码。
- UTF-8 跨 chunk 保留。
- text / control / CSI / SS3 / paste / unknown tokenization。
- legacy CSI / SS3 navigation。
- Kitty / fixterms `CSI ... u`。
- xterm modifyOtherKeys。
- Win32 prefixed keys。
- unknown escape/control 防污染。

不负责：

- stdin raw mode。
- enhanced keyboard 协议启停。
- stdout 写入。
- resize。
- focus traversal。
- widget value/cursor 行为。

## 主链路

```text
stdin data chunk
  ↓
InputTokenizer
  ↓
RawInputToken
  ↓
parseInputToken
  ↓
InputEvent
  ↓
@bindtty/terminal RawStdinInput
```

## Tokenizer

Tokenizer 只切 token，不决定业务 key 名。

```ts
export type RawInputToken =
  | TextToken
  | ControlToken
  | EscapeToken
  | CsiToken
  | Ss3Token
  | PasteToken
  | UnknownToken;
```

CSI 使用标准字节区间识别完整序列：

- parameter bytes: `0x30-0x3f`
- intermediate bytes: `0x20-0x2f`
- final byte: `0x40-0x7e`

Bracketed paste 从 `\x1b[200~` 到 `\x1b[201~` 被视为一个 paste token，中间内容不再解析成按键。

## Parser

Token parser 将 token 映射为 `InputEvent`：

```ts
export interface InputKeyEvent {
  input: string;
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence?: string;
}
```

常见映射：

| 输入序列 | 事件 |
| --- | --- |
| `\r` / `\n` | `name: "return"` |
| `\x7f` / `\b` | `name: "backspace"` |
| `\x1b[A` / `\x1bOA` | `name: "up"` |
| `\x1b[13;5u` | Ctrl+Enter |
| `\x1b[13;5:3u` | Kitty event-type Ctrl+Enter |
| `\x1b[27;5;13~` | modifyOtherKeys Ctrl+Enter |
| unknown CSI | `name: "unknown"` |

## Public API

```ts
export function parseInputChunk(
  chunk: Buffer | string,
  options?: ParseInputChunkOptions
): Iterable<InputEvent>;

export function createInputParser(
  options?: ParseInputChunkOptions
): InputParser;
```

`createInputParser()` 是有状态 parser，用于真实 stdin。它能保留跨 chunk 的 UTF-8 字符和 escape 序列。

```ts
const parser = createInputParser();

parser.parse("\x1b[13;");
parser.hasPending(); // true

parser.parse("5u"); // Ctrl+Enter
parser.hasPending(); // false
```

## Paste

默认 `pasteMode: "text"`，paste 内容展开为普通 text events，保持 TextInput/Textarea 兼容。

```ts
parseInputChunk("\x1b[200~hello\x1b[201~");
```

需要一次性 paste event 时使用：

```ts
parseInputChunk("\x1b[200~hello\x1b[201~", {
  pasteMode: "event"
});
```

`pasteMode: "text"` 时按 **grapheme**（`@bindtty/text` 的 `segmentText`）拆分粘贴内容，与 TextInput/Textarea 编辑语义一致；ZWJ 组合 emoji 会作为单个 text event 展开。

`rawMode: true` 时 `@bindtty/terminal` 的 `DefaultPlatformAdapter` 与 Win32 平台均使用 `RawStdinInput`，完整走本包 parser。未开 raw mode 的兼容路径仍使用 Node readline 的 `ReadlineStdinInput`。

## 与 terminal 的关系

`@bindtty/terminal` 的 `RawStdinInput` 持有 `createInputParser()`。terminal 仍负责：

- raw mode。
- alt screen。
- cursor hide/show。
- enhanced keyboard protocol setup/restore。
- resize。
- Ctrl+C 默认 dispose 策略。

输入协议解析不再放在 terminal 包内重复实现。
