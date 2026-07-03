# BindTTY Examples

每个子目录是一个独立的 npm workspace 示例，需先在仓库根目录构建主包：

```bash
npm install
npm run build
```

运行示例（需真实 TTY，例如本机终端）：

```bash
npm start --workspace @bindtty/example-counter
npm start --workspace @bindtty/example-form
npm start --workspace @bindtty/example-log-viewer
npm start --workspace @bindtty/example-yoga-dashboard
```

| 目录 | 说明 |
| --- | --- |
| [counter](./counter/) | Signal + `Button` 计数器 |
| [form](./form/) | `TextInput` 输入与提交 |
| [log-viewer](./log-viewer/) | `List` / `ScrollView` 长列表滚动 |
| [yoga-dashboard](./yoga-dashboard/) | Yoga layout + 真实 runtime stats dashboard |
