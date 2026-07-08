# BindTTY Examples

每个子目录是一个独立的 npm workspace 示例。仓库根目录可以一次性构建全部包和示例：

```bash
npm install
npm run build
```

也可以直接启动单个示例；每个示例的 `build:deps` 会先按完整 bindtty 栈顺序构建依赖包，避免使用陈旧的 workspace `dist` 产物。

运行示例（需真实 TTY，例如本机终端）：

```bash
npm start --workspace @bindtty/example-counter
npm start --workspace @bindtty/example-form
npm start --workspace @bindtty/example-textarea
npm start --workspace @bindtty/example-log-viewer
npm start --workspace @bindtty/example-yoga-dashboard
npm start --workspace @bindtty/example-wide-text
```

| 目录 | 说明 |
| --- | --- |
| [counter](./counter/) | Signal + `Button` 计数器 |
| [form](./form/) | `TextInput` 输入与提交 |
| [textarea](./textarea/) | `Textarea` soft wrap / caret 手动 playground |
| [log-viewer](./log-viewer/) | `List` / `ScrollView` 长列表滚动 |
| [yoga-dashboard](./yoga-dashboard/) | Yoga layout + 真实 runtime stats dashboard |
| [wide-text](./wide-text/) | CJK / emoji / combining mark 宽字符渲染 |
